-- Staff-filled public forms against a client or a lead.
--
-- public_form_submissions already had lead_id (a public submission can create
-- a lead), but no customer_id — so a form filled in on behalf of an existing
-- client had nowhere to attach.
--
-- No CHECK forcing exactly one, unlike the onboarding tables: a genuine public
-- submission has NEITHER until a lead is created from it, so "exactly one" is
-- wrong here. Both being set is also legitimate — a lead that later converts.

ALTER TABLE public.public_form_submissions
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_public_form_submissions_customer
  ON public.public_form_submissions (customer_id) WHERE customer_id IS NOT NULL;

COMMENT ON COLUMN public.public_form_submissions.customer_id IS
  'Set when the form was filled in against a client (staff-filled, or a public submission later linked). NULL for an anonymous submission.';
