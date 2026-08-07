-- Onboarding forms against a LEAD, not just a customer.
--
-- Qualifying a lead means asking the same questions you'd ask a client, and
-- until now that information had nowhere to live until the lead converted.
--
-- customer_id becomes nullable and lead_id joins it, with a CHECK that exactly
-- one is set. A row belonging to both would be ambiguous everywhere it's read;
-- a row belonging to neither is an orphan. The constraint makes both
-- impossible rather than leaving it to the callers to remember.

ALTER TABLE public.onboarding_requests
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_requests
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.onboarding_responses
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_responses
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.onboarding_requests
  DROP CONSTRAINT IF EXISTS onboarding_requests_subject_check;
ALTER TABLE public.onboarding_requests
  ADD CONSTRAINT onboarding_requests_subject_check
  CHECK ((customer_id IS NOT NULL) <> (lead_id IS NOT NULL));

ALTER TABLE public.onboarding_responses
  DROP CONSTRAINT IF EXISTS onboarding_responses_subject_check;
ALTER TABLE public.onboarding_responses
  ADD CONSTRAINT onboarding_responses_subject_check
  CHECK ((customer_id IS NOT NULL) <> (lead_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_onboarding_requests_lead
  ON public.onboarding_requests (lead_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_responses_lead
  ON public.onboarding_responses (lead_id);

COMMENT ON COLUMN public.onboarding_requests.lead_id IS
  'Set instead of customer_id when the form belongs to a lead. Exactly one of the two is non-null.';
COMMENT ON COLUMN public.onboarding_responses.lead_id IS
  'Set instead of customer_id when the form belongs to a lead. Exactly one of the two is non-null.';
