-- Public Form Builder — a per-business "plugin" (enable/disable like onboarding).
-- Businesses design public/embeddable forms (lead capture, contact, surveys),
-- share them via a public URL (/f/[slug]) or an iframe embed (/embed/[slug]),
-- and each submission can optionally create a lead in the sales pipeline.
--
-- Reuses the onboarding field model (OnboardingField[] in the schema JSONB).
-- No secure/credential fields on public forms (excluded in the builder).

CREATE TABLE IF NOT EXISTS public.form_builder_settings (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.public_forms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,              -- public URL key (globally unique)
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  schema      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ordered field list (OnboardingField[])
  -- settings: submit_text, thank_you_message, redirect_url, create_lead (bool),
  --           lead_map {name,email,phone -> field id}, notify_emails []
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- theme: accent (hex), show_branding (bool)
  theme       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_public_forms_business ON public.public_forms (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_forms_slug ON public.public_forms (slug);

CREATE TABLE IF NOT EXISTS public.public_form_submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  form_id     UUID NOT NULL REFERENCES public.public_forms(id) ON DELETE CASCADE,
  answers     JSONB NOT NULL DEFAULT '{}'::jsonb,
  lead_id     UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- ip, user_agent, referrer
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_public_form_submissions_business ON public.public_form_submissions (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_form_submissions_form ON public.public_form_submissions (form_id, created_at DESC);

ALTER TABLE public.form_builder_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_forms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_form_submissions   ENABLE ROW LEVEL SECURITY;

-- Read: members except workers. Write: owner / admin / editor.
-- Public render + submit go through the service-role client (slug-gated), so
-- there are no anon policies here.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['form_builder_settings','public_forms','public_form_submissions'] LOOP
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

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['form_builder_settings','public_forms'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_updated_at ON public.%1$s;
      CREATE TRIGGER %1$s_updated_at BEFORE UPDATE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();', t);
  END LOOP;
END $$;

-- Private bucket for public-form file/image uploads (served via signed URLs).
INSERT INTO storage.buckets (id, name, public) VALUES ('public-form-uploads', 'public-form-uploads', false)
ON CONFLICT (id) DO NOTHING;
