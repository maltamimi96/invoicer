-- Instant-audit sales engine (docs/SEO_AGENCY_PLAN.md, Phase 4).
-- Public lead magnet: a prospect submits a URL + email on the agency's audit
-- page; we create a lead and queue an audit that (in the follow-up) runs the
-- auditor agent → branded PDF → email. Additive.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS audit_slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_audit_slug ON public.businesses (audit_slug) WHERE audit_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.seo_audits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  email       TEXT,
  name        TEXT,
  lead_id     UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  score       INTEGER,
  result      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- findings + summary
  view_token  TEXT,                                 -- public result/PDF access
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seo_audits_business ON public.seo_audits (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_audits_queued ON public.seo_audits (created_at) WHERE status = 'queued';

ALTER TABLE public.seo_audits ENABLE ROW LEVEL SECURITY;
-- Read: members except workers. Writes go through the service-role client
-- (public submit + cron), so no anon/write policy here.
DROP POLICY IF EXISTS seo_audits_read ON public.seo_audits;
CREATE POLICY seo_audits_read ON public.seo_audits FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);

DROP TRIGGER IF EXISTS seo_audits_updated_at ON public.seo_audits;
CREATE TRIGGER seo_audits_updated_at BEFORE UPDATE ON public.seo_audits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
