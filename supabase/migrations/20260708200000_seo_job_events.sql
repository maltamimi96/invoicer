-- SEO agent activity log (docs/SEO_AGENCY_PLAN.md, Phase 2) — the "terminal".
-- One row per agent-step lifecycle event so the site hub can stream what the
-- agents are doing. Written by the service-role engine (bypasses RLS); read by
-- members (except workers). Additive.
CREATE TABLE IF NOT EXISTS public.seo_job_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  site_id     UUID REFERENCES public.seo_sites(id) ON DELETE CASCADE,
  job_id      UUID REFERENCES public.seo_jobs(id) ON DELETE CASCADE,
  agent_id    TEXT,
  level       TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','success','error')),
  message     TEXT NOT NULL,
  cost_cents  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seo_job_events_site ON public.seo_job_events (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_job_events_business ON public.seo_job_events (business_id, created_at DESC);

ALTER TABLE public.seo_job_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seo_job_events_read ON public.seo_job_events;
CREATE POLICY seo_job_events_read ON public.seo_job_events FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);
