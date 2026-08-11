-- Prospecting v2: a target, named criteria, real areas, live progress, and an
-- auditor that tells you why a run went badly.
--
-- v1 could only answer "here's what I found". The gaps that made it feel thin:
-- you couldn't say how many you wanted, every criterion was buried in one
-- paragraph so a rejection never told you WHICH requirement failed, an area
-- was a single circle, a run was a black box for minutes, and a hunt that
-- returned nothing left you guessing whether the terms, the filters, or the
-- criteria were at fault.

-- ── Hunts: what you're asking for ──────────────────────────────────────────
ALTER TABLE public.prospect_hunts
  -- How many verified prospects you actually want. The run stops when it has
  -- them rather than judging everything Google returned — the cost of a run
  -- should follow the size of the ask, not the size of the suburb.
  ADD COLUMN IF NOT EXISTS target_count INTEGER NOT NULL DEFAULT 20
    CONSTRAINT prospect_hunts_target_range CHECK (target_count BETWEEN 1 AND 100),

  -- 'radius' = one circle. 'suburbs' = a named list, each searched in its own
  -- right. A service area is usually "these six suburbs", not a circle that
  -- happens to cover them plus a harbour.
  ADD COLUMN IF NOT EXISTS area_mode TEXT NOT NULL DEFAULT 'radius'
    CONSTRAINT prospect_hunts_area_mode CHECK (area_mode IN ('radius', 'suburbs')),
  ADD COLUMN IF NOT EXISTS suburbs JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Named requirements, judged and reported one by one:
  --   [{ id, label, requirement, required }]
  -- The point is the reporting. With one blob of criteria a rejection says
  -- "not a fit"; with named params it says WHICH one failed, which is the
  -- difference between fixing the hunt and guessing at it.
  ADD COLUMN IF NOT EXISTS custom_params JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.prospect_hunts.suburbs IS
  'When area_mode = suburbs: [{label, lat, lng, radius_m}]. Each is searched separately.';
COMMENT ON COLUMN public.prospect_hunts.custom_params IS
  'Named requirements: [{id, label, requirement, required}]. Judged individually so failures name themselves.';

-- ── Runs: progress you can watch, and a verdict on the run itself ──────────
ALTER TABLE public.prospect_hunt_runs
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'queued'
    CONSTRAINT prospect_hunt_runs_stage CHECK (
      stage IN ('queued', 'searching', 'screening', 'verifying', 'auditing', 'finished')),
  -- Progress is processed/total within the current stage, so a bar can move
  -- during the slow part instead of sitting at 0 for two minutes.
  ADD COLUMN IF NOT EXISTS processed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total INTEGER NOT NULL DEFAULT 0,
  -- The auditor's findings: { summary, problems: [{severity, title, detail, fix}] }
  ADD COLUMN IF NOT EXISTS audit JSONB;

COMMENT ON COLUMN public.prospect_hunt_runs.audit IS
  'The audit agent on the run itself — why it under-delivered and what to change.';

-- ── The live feed ─────────────────────────────────────────────────────────
-- Same shape as seo_job_events, for the same reason: a multi-minute agent run
-- with no output reads as a hang.
CREATE TABLE IF NOT EXISTS public.prospect_hunt_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  hunt_id     UUID REFERENCES public.prospect_hunts(id) ON DELETE CASCADE,
  run_id      UUID REFERENCES public.prospect_hunt_runs(id) ON DELETE CASCADE,
  level       TEXT NOT NULL DEFAULT 'info'
    CHECK (level IN ('info', 'success', 'warn', 'error')),
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_hunt_events_run
  ON public.prospect_hunt_events (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_prospect_hunt_events_business
  ON public.prospect_hunt_events (business_id, created_at DESC);

ALTER TABLE public.prospect_hunt_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospect_hunt_events_read ON public.prospect_hunt_events;
CREATE POLICY prospect_hunt_events_read ON public.prospect_hunt_events FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND status = 'active'
  ) AND NOT public.is_business_worker(business_id)
);

-- Candidates gain the per-param breakdown, so the review queue can show which
-- requirement each business met and which it missed.
ALTER TABLE public.prospect_candidates
  ADD COLUMN IF NOT EXISTS param_results JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.prospect_candidates.param_results IS
  'Per-custom-param verdicts: [{id, label, pass, note}].';
