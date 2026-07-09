-- White-label SEO client reports (docs/SEO_AGENCY_PLAN.md, Phase 3).
-- A monthly report per site: rankings movement, work delivered, next-month
-- plan — assembled from existing SEO data, rendered to a branded PDF, and
-- (in a follow-up) delivered to the client portal. Additive.
CREATE TABLE IF NOT EXISTS public.seo_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  site_id      UUID NOT NULL REFERENCES public.seo_sites(id) ON DELETE CASCADE,
  title        TEXT,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  metrics      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- rankings / traffic
  work_log     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- content shipped, opps done
  plan         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- next-month plan
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','sent')),
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seo_reports_site ON public.seo_reports (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_reports_business ON public.seo_reports (business_id, created_at DESC);

ALTER TABLE public.seo_reports ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  EXECUTE $f$
    DROP POLICY IF EXISTS seo_reports_read ON public.seo_reports;
    CREATE POLICY seo_reports_read ON public.seo_reports FOR SELECT USING (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
      ) AND NOT public.is_business_worker(business_id)
    );
    DROP POLICY IF EXISTS seo_reports_write ON public.seo_reports;
    CREATE POLICY seo_reports_write ON public.seo_reports FOR ALL USING (
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
  $f$;
END $$;

DROP TRIGGER IF EXISTS seo_reports_updated_at ON public.seo_reports;
CREATE TRIGGER seo_reports_updated_at BEFORE UPDATE ON public.seo_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
