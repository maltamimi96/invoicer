-- ============================================================================
-- Content Studio — social/marketing content pipeline
--
-- Sibling of the SEO plugin (20260708120000_seo_foundation.sql) and the same
-- tenancy: the agency is the BUSINESS, each client is a CUSTOMER. Every row
-- carries business_id for RLS.
--
-- Three deliberate departures from the SEO schema, each fixing something that
-- bit it. They are not oversights:
--
--   1. ONE status column per row. seo_content_pieces carries both `status` and
--      `pipeline_status`, written together and free to desync. Here a piece has
--      a generation lifecycle and a variation has an editorial one — separate
--      concerns, separate rows, one column each.
--
--   2. content_jobs has locked_until + attempts. seo_jobs has neither, and its
--      cron claims work with a plain SELECT — two overlapping ticks run the
--      same step twice, billing twice. The claim function lands with the engine.
--
--   3. No `output` / `checkpoint`. Both exist on seo_jobs; `output` is never
--      written and `checkpoint` is written but never read.
--
-- Brand voice is the point of this plugin, not decoration: seo_brand_profiles
-- exists but nothing in the app reads or writes it, so the SEO voice agent
-- aligns to a voice it was never told. content_brands is read on every run.
-- ============================================================================

-- ── brands: one per client, the voice the whole pipeline writes in ───────────
CREATE TABLE IF NOT EXISTS public.content_brands (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- The client this brand belongs to. NULL = the agency's own brand.
  customer_id    UUID                 REFERENCES public.customers(id)  ON DELETE SET NULL,
  name           TEXT        NOT NULL,
  -- What they do, so the scout researches roofing and not "business".
  industry       TEXT,
  services       TEXT[]      NOT NULL DEFAULT '{}',
  service_area   TEXT,
  audience       TEXT,
  voice          TEXT,
  tone           TEXT,
  -- Claims they can actually stand behind: licences, years trading, warranty.
  proof_points   TEXT,
  -- Words the client refuses to say. Enforced by the voice agent.
  banned_phrases TEXT[]      NOT NULL DEFAULT '{}',
  -- Real posts of theirs that landed — few-shot examples beat adjectives.
  examples       TEXT,
  profile        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT        NOT NULL DEFAULT 'active'
                                     CHECK (status IN ('active','paused','archived')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── topics: what the research agent found ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_topics (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id)      ON DELETE CASCADE,
  brand_id    UUID        NOT NULL REFERENCES public.content_brands(id)  ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  -- Why now: the evidence the scout found. Carried into the piece's artifacts
  -- so the chain actually reads the research — the SEO scout's output never
  -- reaches its pipeline at all.
  detail      TEXT,
  angle_hint  TEXT,
  -- Trades work is seasonal; a storm-season topic in January is worthless.
  season      TEXT,
  source_urls TEXT[]      NOT NULL DEFAULT '{}',
  priority    INTEGER     NOT NULL DEFAULT 5,
  status      TEXT        NOT NULL DEFAULT 'queued'
                                  CHECK (status IN ('queued','in_progress','done','dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── campaigns: a themed arc across several pieces ────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_campaigns (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id)     ON DELETE CASCADE,
  brand_id    UUID        NOT NULL REFERENCES public.content_brands(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  theme       TEXT,
  goal        TEXT,
  starts_on   DATE,
  cadence     TEXT,
  status      TEXT        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','active','done','archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── pieces: one request, one pipeline run ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_pieces (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id)        ON DELETE CASCADE,
  brand_id    UUID        NOT NULL REFERENCES public.content_brands(id)    ON DELETE CASCADE,
  topic_id    UUID                 REFERENCES public.content_topics(id)    ON DELETE SET NULL,
  campaign_id UUID                 REFERENCES public.content_campaigns(id) ON DELETE SET NULL,
  topic       TEXT        NOT NULL,
  kind        TEXT        NOT NULL DEFAULT 'post'
                                  CHECK (kind IN ('script','post','hooks','campaign')),
  -- Which platforms to render for. Validated in app code: a CHECK on an array
  -- can't be maintained without a domain, and the registry is the source.
  platforms   TEXT[]      NOT NULL DEFAULT '{}',
  -- How many distinct creative angles to fan out into.
  angle_count INTEGER     NOT NULL DEFAULT 3 CHECK (angle_count BETWEEN 1 AND 6),
  -- Whole pipeline state in one column: { artifact_key: {content, created_at} }.
  artifacts   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  current_stage TEXT,
  -- ONE status. See the header note.
  status      TEXT        NOT NULL DEFAULT 'idle'
                                  CHECK (status IN ('idle','running','awaiting_approval','done','failed')),
  job_id      UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── variations: the fan-out. angle x platform. ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_variations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES public.businesses(id)     ON DELETE CASCADE,
  piece_id     UUID        NOT NULL REFERENCES public.content_pieces(id) ON DELETE CASCADE,
  -- The creative angle this came from, e.g. "storm-season urgency".
  angle        TEXT        NOT NULL,
  angle_index  INTEGER     NOT NULL DEFAULT 0,
  platform     TEXT        NOT NULL,
  hook         TEXT,
  body         TEXT,
  -- Script beats, hashtags, on-screen text, first comment — shape varies by kind.
  assets       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status       TEXT        NOT NULL DEFAULT 'draft'
                                   CHECK (status IN ('draft','approved','rejected','scheduled','posted')),
  scheduled_at TIMESTAMPTZ,
  posted_at    TIMESTAMPTZ,
  -- Provider-side id once posted. Phase 2.
  external_id  TEXT,
  external_url TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (piece_id, angle_index, platform)
);

-- ── jobs: the runner ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL REFERENCES public.businesses(id)     ON DELETE CASCADE,
  brand_id      UUID                 REFERENCES public.content_brands(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL DEFAULT 'content_pipeline',
  status        TEXT        NOT NULL DEFAULT 'queued'
                                    CHECK (status IN ('queued','running','awaiting_approval','done','failed')),
  step          INTEGER     NOT NULL DEFAULT 0,
  input         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  cost_cents    INTEGER     NOT NULL DEFAULT 0,
  -- Lease. A claim sets this forward; only an expired lease can be re-claimed,
  -- so two overlapping cron ticks cannot run the same step. seo_jobs has no
  -- equivalent and double-runs under overlap.
  locked_until  TIMESTAMPTZ,
  -- Retries. The SEO engine treats any throw as terminal, so a single transient
  -- 529 kills a whole run.
  attempts      INTEGER     NOT NULL DEFAULT 0,
  error         TEXT,
  last_error_at TIMESTAMPTZ,
  -- When to next attempt. Backoff pushes this forward.
  run_after     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── job events: the live terminal feed ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_job_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id)     ON DELETE CASCADE,
  brand_id    UUID                 REFERENCES public.content_brands(id) ON DELETE CASCADE,
  job_id      UUID                 REFERENCES public.content_jobs(id)   ON DELETE CASCADE,
  agent_id    TEXT,
  level       TEXT        NOT NULL DEFAULT 'info'
                                  CHECK (level IN ('info','success','error')),
  message     TEXT        NOT NULL,
  cost_cents  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── budget ───────────────────────────────────────────────────────────────────
-- Mirrors businesses.seo_monthly_budget_cents. 0 = unlimited.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS content_monthly_budget_cents INTEGER NOT NULL DEFAULT 2000;

-- ── indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_content_brands_business     ON public.content_brands (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_brands_customer     ON public.content_brands (customer_id);
CREATE INDEX IF NOT EXISTS idx_content_topics_brand        ON public.content_topics (brand_id, status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_content_topics_business     ON public.content_topics (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_campaigns_brand     ON public.content_campaigns (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_pieces_brand        ON public.content_pieces (brand_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_pieces_business     ON public.content_pieces (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_pieces_campaign     ON public.content_pieces (campaign_id);
CREATE INDEX IF NOT EXISTS idx_content_variations_piece    ON public.content_variations (piece_id, angle_index, platform);
CREATE INDEX IF NOT EXISTS idx_content_variations_business ON public.content_variations (business_id, created_at DESC);
-- Drives the calendar.
CREATE INDEX IF NOT EXISTS idx_content_variations_sched    ON public.content_variations (business_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL;
-- Drives the claim: the runner asks for due, unlocked work only.
CREATE INDEX IF NOT EXISTS idx_content_jobs_claim          ON public.content_jobs (run_after)
  WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_content_jobs_business       ON public.content_jobs (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_job_events_brand    ON public.content_job_events (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_job_events_business ON public.content_job_events (business_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.content_brands     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_topics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_pieces     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_job_events ENABLE ROW LEVEL SECURITY;

-- Same loop as seo_foundation.sql:145-181. Read = members except workers
-- (the mandatory no-workers rule); write = owner/admin/editor. Crons use the
-- service role and bypass both.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'content_brands','content_topics','content_campaigns',
    'content_pieces','content_variations','content_jobs'
  ] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS %1$s_read ON public.%1$s;
      CREATE POLICY %1$s_read ON public.%1$s FOR SELECT USING (
        business_id IN (
          SELECT id FROM public.businesses WHERE user_id = auth.uid()
          UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
        ) AND NOT public.is_business_worker(business_id)
      );
      DROP POLICY IF EXISTS %1$s_write ON public.%1$s;
      CREATE POLICY %1$s_write ON public.%1$s FOR ALL USING (
        business_id IN (
          SELECT id FROM public.businesses WHERE user_id = auth.uid()
          UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active' AND role IN ('admin','editor')
        )
      ) WITH CHECK (
        business_id IN (
          SELECT id FROM public.businesses WHERE user_id = auth.uid()
          UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active' AND role IN ('admin','editor')
        )
      );
    $f$, t);
  END LOOP;
END $$;

-- Events are read-only to users, exactly like seo_job_events: only the
-- service-role engine writes them, so there is deliberately no write policy.
DROP POLICY IF EXISTS content_job_events_read ON public.content_job_events;
CREATE POLICY content_job_events_read ON public.content_job_events FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);

-- ── updated_at triggers ──────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'content_brands','content_topics','content_campaigns',
    'content_pieces','content_variations','content_jobs'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_updated_at ON public.%1$s;
      CREATE TRIGGER %1$s_updated_at BEFORE UPDATE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();', t);
  END LOOP;
END $$;

COMMENT ON COLUMN public.content_jobs.locked_until IS
  'Lease held by a cron tick. Only an expired lease may be re-claimed — this is what stops two overlapping ticks from running (and billing) the same step twice.';

COMMENT ON COLUMN public.content_brands.examples IS
  'The client''s own posts that actually worked. Few-shot examples beat any number of adjectives about "tone".';
