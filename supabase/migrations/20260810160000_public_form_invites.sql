-- Sending a public (Form Builder) form to someone you ALREADY have.
--
-- Public forms are built to capture strangers: /f/<slug> is open, and a
-- submission calls upsert_lead to create the person. That is exactly wrong
-- when you want a specific lead to fill one in — the submission would mint a
-- SECOND record of someone already in the pipeline. lead_identity_key catches
-- the obvious duplicates, but not a lead who fills the form with their work
-- email when we hold their personal one.
--
-- An invite is a one-person, one-form token. The submit route resolves it to
-- the lead (or customer) it was minted for and attaches the submission there,
-- skipping lead creation entirely.
--
-- Deliberately NOT customer_portal_tokens: that token opens the whole portal —
-- invoices, quotes, balances. Emailing it so somebody can answer four
-- questions hands them everything else in the same link. This token does one
-- thing.

CREATE TABLE IF NOT EXISTS public.public_form_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  form_id      UUID NOT NULL REFERENCES public.public_forms(id) ON DELETE CASCADE,
  -- Exactly one subject, same rule as onboarding_requests.
  lead_id      UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  customer_id  UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at      TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  CONSTRAINT public_form_invites_subject_check
    CHECK ((lead_id IS NOT NULL) <> (customer_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_public_form_invites_business
  ON public.public_form_invites (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_form_invites_lead
  ON public.public_form_invites (lead_id);
CREATE INDEX IF NOT EXISTS idx_public_form_invites_form
  ON public.public_form_invites (form_id, created_at DESC);

-- Which invite produced a submission. Null for ordinary public traffic.
ALTER TABLE public.public_form_submissions
  ADD COLUMN IF NOT EXISTS invite_id UUID
  REFERENCES public.public_form_invites(id) ON DELETE SET NULL;

ALTER TABLE public.public_form_invites ENABLE ROW LEVEL SECURITY;

-- Same shape as the rest of the Form Builder tables: members except workers
-- read, owner/admin/editor write. The public submit path uses the
-- service-role client (token-gated), so there is no anon policy.
DROP POLICY IF EXISTS public_form_invites_read ON public.public_form_invites;
CREATE POLICY public_form_invites_read ON public.public_form_invites FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);

DROP POLICY IF EXISTS public_form_invites_write ON public.public_form_invites;
CREATE POLICY public_form_invites_write ON public.public_form_invites FOR ALL USING (
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

COMMENT ON TABLE public.public_form_invites IS
  'A public form sent to one known lead or customer. The submit route attaches the submission to that person instead of creating a new lead.';
COMMENT ON COLUMN public.public_form_submissions.invite_id IS
  'The invite this submission came from, if it was sent to a known person rather than filled by public traffic.';
