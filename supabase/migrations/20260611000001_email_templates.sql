-- Per-business email template overrides. One row per (business, template_type);
-- absent row (or NULL field) means "use the built-in default". The senders
-- resolve row → defaults at send time, so deleting a row resets the template.
CREATE TABLE IF NOT EXISTS public.email_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  template_type        TEXT NOT NULL CHECK (template_type IN
                         ('invoice','quote','team_invite','work_order_submitted')),
  -- All text fields support {{variable}} placeholders (see lib/emails/templates.ts).
  subject              TEXT,
  greeting             TEXT,
  intro                TEXT,
  footer_note          TEXT,
  accent_color         TEXT,
  show_line_items      BOOLEAN NOT NULL DEFAULT TRUE,
  show_payment_details BOOLEAN NOT NULL DEFAULT TRUE,
  show_buttons         BOOLEAN NOT NULL DEFAULT TRUE,
  -- Advanced: full replacement for the email body (inner content). When set,
  -- greeting/intro/sections are ignored; the base wrapper + subject still apply.
  custom_html          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, template_type)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_business
  ON public.email_templates (business_id, template_type);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_templates_read ON public.email_templates;
CREATE POLICY email_templates_read ON public.email_templates FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
     WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);

DROP POLICY IF EXISTS email_templates_write ON public.email_templates;
CREATE POLICY email_templates_write ON public.email_templates FOR ALL USING (
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

DROP TRIGGER IF EXISTS email_templates_updated_at ON public.email_templates;
CREATE TRIGGER email_templates_updated_at BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
