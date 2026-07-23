-- Document templates for invoices & quotes.
--
-- Businesses can save named, reusable PDF templates (theme, background, fonts,
-- custom fields, column layout, section toggles, labels) and pick a default per
-- document type. Each invoice/quote can point at a specific template; NULL means
-- "use the business default", which itself falls back to the legacy
-- businesses.pdf_settings so nothing that exists today changes appearance.
--
-- Mirrors the email_templates model (per-business rows, RLS: members read,
-- owner/admin/editor write, workers blocked).

CREATE TABLE IF NOT EXISTS public.document_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name         text NOT NULL,
  -- Which document types the template can be applied to.
  doc_type     text NOT NULL DEFAULT 'both' CHECK (doc_type IN ('invoice','quote','both')),
  -- The default template for its doc_type(s). Enforced to one-per-type in code
  -- (setDefault clears siblings) — a partial unique index can't express the
  -- 'both' overlap cleanly, so we keep the invariant in the server action.
  is_default   boolean NOT NULL DEFAULT false,
  -- Full render config (theme, background, fonts, custom fields, columns, …).
  config       jsonb   NOT NULL DEFAULT '{}'::jsonb,
  -- 'preset' = cloned from a built-in starter, 'user' = built from scratch.
  source       text    NOT NULL DEFAULT 'user' CHECK (source IN ('preset','user')),
  preset_key   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_templates_business_idx
  ON public.document_templates (business_id, doc_type);
CREATE INDEX IF NOT EXISTS document_templates_default_idx
  ON public.document_templates (business_id, doc_type, is_default);

-- Per-document template selection. ON DELETE SET NULL so deleting a template
-- silently reverts affected docs to the business default.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS template_id uuid
  REFERENCES public.document_templates(id) ON DELETE SET NULL;
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS template_id uuid
  REFERENCES public.document_templates(id) ON DELETE SET NULL;

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.touch_document_templates_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_document_templates_updated_at ON public.document_templates;
CREATE TRIGGER trg_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_document_templates_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

-- Read: owner or any active member that is NOT a worker.
DROP POLICY IF EXISTS document_templates_read ON public.document_templates;
CREATE POLICY document_templates_read ON public.document_templates
  FOR SELECT USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
    AND NOT public.is_business_worker(business_id)
  );

-- Write: owner or an active admin/editor member.
DROP POLICY IF EXISTS document_templates_write ON public.document_templates;
CREATE POLICY document_templates_write ON public.document_templates
  FOR ALL USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members
       WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin','editor')
    )
    AND NOT public.is_business_worker(business_id)
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members
       WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin','editor')
    )
    AND NOT public.is_business_worker(business_id)
  );
