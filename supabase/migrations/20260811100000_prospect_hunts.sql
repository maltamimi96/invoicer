-- The prospecting agent: a saved hunt, its runs, and what it found.
--
-- Sourcing already existed (outreach_settings.sourcing_queries + locations →
-- Google Places) but it was a single static list per business with no notion
-- of "who counts as a prospect". This adds the missing half: named hunts with
-- their own area and criteria, and a verification pass that judges each
-- candidate against those criteria before anything reaches your prospect list.
--
-- Three tables, because the three things have genuinely different lifetimes:
-- a hunt is edited over months, a run is a moment, a candidate is reviewed
-- once and then either becomes a prospect or doesn't.

-- ── The saved parameter set ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospect_hunts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,

  -- What to search Places for: ["roof repair", "roofing contractor"].
  queries      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Where. Places takes a circle, so this is a centre and a radius rather
  -- than a suburb name — "within 25km of Parramatta" is the actual question
  -- being asked, and a suburb list can't express it.
  centre_label TEXT,
  centre_lat   DOUBLE PRECISION,
  centre_lng   DOUBLE PRECISION,
  radius_m     INTEGER NOT NULL DEFAULT 25000,

  -- 🔴 The dynamic part, and the reason this table exists. Free text, handed
  -- to the verifying agent verbatim: "service-based tradies with no website",
  -- "gyms with fewer than 3 locations", whatever the business is hunting.
  -- NOT an enum: the whole point is that the operator changes their mind
  -- without a migration.
  criteria     TEXT NOT NULL,

  -- Hard filters applied in code before any model is called, because they are
  -- cheap and unambiguous. { "no_website": true, "min_rating": 4 }
  filters      JSONB NOT NULL DEFAULT '{}'::jsonb,

  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_hunts_business
  ON public.prospect_hunts (business_id, created_at DESC);

COMMENT ON COLUMN public.prospect_hunts.criteria IS
  'Free text, given to the verifying agent as-is. Deliberately not an enum.';

-- ── One execution ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospect_hunt_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  hunt_id       UUID NOT NULL REFERENCES public.prospect_hunts(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'running',
  CONSTRAINT prospect_hunt_runs_status_check
    CHECK (status IN ('running', 'done', 'failed', 'cancelled')),

  -- The funnel, so the run tells you where candidates were lost rather than
  -- just how many survived.
  found         INTEGER NOT NULL DEFAULT 0,   -- returned by Places
  screened_out  INTEGER NOT NULL DEFAULT 0,   -- failed a cheap check
  verified      INTEGER NOT NULL DEFAULT 0,   -- an agent judged them a fit
  rejected      INTEGER NOT NULL DEFAULT 0,   -- an agent judged them not

  cost_cents    NUMERIC(10,3) NOT NULL DEFAULT 0,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prospect_hunt_runs_hunt
  ON public.prospect_hunt_runs (hunt_id, started_at DESC);

-- ── What it found ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospect_candidates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  hunt_id      UUID NOT NULL REFERENCES public.prospect_hunts(id) ON DELETE CASCADE,
  run_id       UUID REFERENCES public.prospect_hunt_runs(id) ON DELETE SET NULL,

  -- Places' own id. The unique index below is what stops the same business
  -- being re-surfaced every single run.
  place_id     TEXT,

  name         TEXT NOT NULL,
  address      TEXT,
  phone        TEXT,
  website      TEXT,
  category     TEXT,
  rating       NUMERIC(2,1),
  review_count INTEGER,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  raw          JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Verification output.
  status       TEXT NOT NULL DEFAULT 'pending',
  CONSTRAINT prospect_candidates_status_check
    CHECK (status IN ('pending', 'screened_out', 'verified', 'rejected', 'added', 'dismissed')),
  score        INTEGER,          -- 0-100, the agent's confidence in the fit
  reasoning    TEXT,             -- why. Shown in the review queue verbatim.
  checks       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- cheap-check results

  -- Set once someone approves it and it becomes a real prospect.
  prospect_id  UUID REFERENCES public.prospects(id) ON DELETE SET NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per business per place, ever. Re-running a hunt weekly should
-- surface what is NEW, not re-present everything you already rejected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_prospect_candidates_place
  ON public.prospect_candidates (business_id, place_id)
  WHERE place_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospect_candidates_review
  ON public.prospect_candidates (business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_candidates_run
  ON public.prospect_candidates (run_id);

-- ── RLS: members except workers read, owner/admin/editor write ─────────────
ALTER TABLE public.prospect_hunts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_hunt_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_candidates  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['prospect_hunts','prospect_hunt_runs','prospect_candidates'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS %1$s_read ON public.%1$s;
      CREATE POLICY %1$s_read ON public.%1$s FOR SELECT USING (
        business_id IN (
          SELECT id FROM public.businesses WHERE user_id = auth.uid()
          UNION SELECT business_id FROM public.business_members
            WHERE user_id = auth.uid() AND status='active'
        ) AND NOT public.is_business_worker(business_id)
      );
      DROP POLICY IF EXISTS %1$s_write ON public.%1$s;
      CREATE POLICY %1$s_write ON public.%1$s FOR ALL USING (
        business_id IN (
          SELECT id FROM public.businesses WHERE user_id = auth.uid()
          UNION SELECT business_id FROM public.business_members
            WHERE user_id = auth.uid() AND status='active' AND role IN ('admin','editor')
        )
      ) WITH CHECK (
        business_id IN (
          SELECT id FROM public.businesses WHERE user_id = auth.uid()
          UNION SELECT business_id FROM public.business_members
            WHERE user_id = auth.uid() AND status='active' AND role IN ('admin','editor')
        )
      );
    $f$, t);
  END LOOP;
END $$;

COMMENT ON TABLE public.prospect_candidates IS
  'Businesses a hunt found. Nothing here is a prospect until someone approves it.';
