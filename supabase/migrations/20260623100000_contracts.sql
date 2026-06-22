-- Customer contracts + e-signature (signed via Dropbox Sign, one platform account).
-- Two authoring modes: rich-text (content_html) or an uploaded PDF (source_path).

CREATE TABLE IF NOT EXISTS public.contract_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_templates_business ON public.contract_templates (business_id);

CREATE TABLE IF NOT EXISTS public.contracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'rich_text' CHECK (kind IN ('rich_text','pdf')),
  content_html  TEXT,                 -- rich-text body (kind='rich_text')
  source_path   TEXT,                 -- storage path of the uploaded source PDF (kind='pdf')
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','viewed','signed','declined','voided')),
  signer_name   TEXT,
  signer_email  TEXT,
  -- e-signature linkage (Dropbox Sign)
  provider              TEXT,         -- 'dropbox_sign'
  provider_request_id   TEXT,         -- signature_request_id
  signed_path           TEXT,         -- storage path of the final signed PDF
  sent_at       TIMESTAMPTZ,
  viewed_at     TIMESTAMPTZ,
  signed_at     TIMESTAMPTZ,
  audit         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- ip/timestamps/events
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_business ON public.contracts (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON public.contracts (customer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_provider_req ON public.contracts (provider_request_id) WHERE provider_request_id IS NOT NULL;

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- Read: any active member except workers. Write: owner / admin / editor.
DROP POLICY IF EXISTS contract_templates_read ON public.contract_templates;
CREATE POLICY contract_templates_read ON public.contract_templates FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);
DROP POLICY IF EXISTS contract_templates_write ON public.contract_templates;
CREATE POLICY contract_templates_write ON public.contract_templates FOR ALL USING (
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

DROP POLICY IF EXISTS contracts_read ON public.contracts;
CREATE POLICY contracts_read ON public.contracts FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);
DROP POLICY IF EXISTS contracts_write ON public.contracts;
CREATE POLICY contracts_write ON public.contracts FOR ALL USING (
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

DROP TRIGGER IF EXISTS contract_templates_updated_at ON public.contract_templates;
CREATE TRIGGER contract_templates_updated_at BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS contracts_updated_at ON public.contracts;
CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Private bucket for source + signed contract PDFs (served via admin client / signed URLs).
INSERT INTO storage.buckets (id, name, public) VALUES ('contracts', 'contracts', false)
ON CONFLICT (id) DO NOTHING;
