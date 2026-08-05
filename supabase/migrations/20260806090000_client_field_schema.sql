-- Industry-aware client profiles.
--
-- A roofer's client and a marketing agency's client are not the same record.
-- The roofer wants roof type and access notes; the agency wants retainer,
-- socials and brand assets. Hardcoding either one makes the app wrong for the
-- other, and hardcoding both makes it wrong for everyone.
--
-- So: the industry preset supplies DEFAULTS, and the business can override.
-- NULL schema means "use the preset's default", which is what keeps existing
-- businesses unchanged — nobody gets a migration-day surprise.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS customer_field_schema JSONB;

-- Answers keyed by field id, same shape the onboarding engine already uses.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.businesses.customer_field_schema IS
  'OnboardingField[] describing this business''s client profile. NULL = use the industry preset default.';
COMMENT ON COLUMN public.customers.custom_fields IS
  'Answers to customer_field_schema, keyed by field id.';
