-- Client onboarding forms — a per-business form builder ("plugin", enable/disable
-- like the quoting agent). Businesses design custom intake forms (ABN, socials,
-- opening hours, images, secure credentials…), send them to customers through the
-- existing customer-portal token system, and responses are stored per customer.
--
-- Secure fields ("secure" type — e.g. Instagram passwords) are AES-256-GCM
-- encrypted app-side before they land in answers JSONB; the DB never sees
-- plaintext credentials.

-- Feature flag (mirrors quoting_agent_settings)
CREATE TABLE IF NOT EXISTS public.onboarding_settings (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Form definitions (a business can have several)
CREATE TABLE IF NOT EXISTS public.onboarding_forms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  schema      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ordered field list
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,   -- thank_you_message, allow_edit_after_submit…
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_forms_business ON public.onboarding_forms (business_id, created_at DESC);

-- A form sent to a specific customer (delivered via customer_portal_tokens)
CREATE TABLE IF NOT EXISTS public.onboarding_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  form_id      UUID NOT NULL REFERENCES public.onboarding_forms(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','viewed','completed')),
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at    TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_requests_business ON public.onboarding_requests (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_requests_customer ON public.onboarding_requests (customer_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_requests_form     ON public.onboarding_requests (form_id);

-- Submitted (or draft/autosaved) answers
CREATE TABLE IF NOT EXISTS public.onboarding_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  request_id      UUID NOT NULL UNIQUE REFERENCES public.onboarding_requests(id) ON DELETE CASCADE,
  form_id         UUID NOT NULL REFERENCES public.onboarding_forms(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  answers         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- keyed by field id; secure fields hold {"enc": "..."}
  schema_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,   -- fields as asked, so edits to the form don't orphan answers
  draft           BOOLEAN NOT NULL DEFAULT TRUE,        -- autosave until final submit
  submitted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_responses_business ON public.onboarding_responses (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_responses_customer ON public.onboarding_responses (customer_id);

ALTER TABLE public.onboarding_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_forms     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;

-- Read: any active member except workers. Write: owner / admin / editor.
-- (Portal submit path uses the service-role client gated by the portal token,
--  so no anon policies are needed.)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['onboarding_settings','onboarding_forms','onboarding_requests','onboarding_responses'] LOOP
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

-- updated_at triggers
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['onboarding_settings','onboarding_forms','onboarding_requests','onboarding_responses'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_updated_at ON public.%1$s;
      CREATE TRIGGER %1$s_updated_at BEFORE UPDATE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();', t);
  END LOOP;
END $$;

-- Private bucket for customer file/image uploads (served via signed URLs;
-- portal uploads go through a token-gated API route using the admin client).
INSERT INTO storage.buckets (id, name, public) VALUES ('onboarding-uploads', 'onboarding-uploads', false)
ON CONFLICT (id) DO NOTHING;
