-- Prospects plugin — a top-of-funnel cold list that feeds Leads on convert.
-- Additive. Email-keyed dedupe; converts into leads via upsert_lead.
CREATE TABLE IF NOT EXISTS public.prospects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id       UUID,
  name          TEXT,
  email         TEXT,
  phone         TEXT,
  company       TEXT,
  title         TEXT,
  website       TEXT,
  source        TEXT,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','responded','qualified','unqualified','converted')),
  tags          TEXT[] NOT NULL DEFAULT '{}',
  notes         TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_contacted_at TIMESTAMPTZ,
  lead_id       UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_biz_email ON public.prospects (business_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_business ON public.prospects (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON public.prospects (business_id, status);

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospects_read ON public.prospects;
CREATE POLICY prospects_read ON public.prospects FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);
DROP POLICY IF EXISTS prospects_write ON public.prospects;
CREATE POLICY prospects_write ON public.prospects FOR ALL USING (
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

DROP TRIGGER IF EXISTS prospects_updated_at ON public.prospects;
CREATE TRIGGER prospects_updated_at BEFORE UPDATE ON public.prospects FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
