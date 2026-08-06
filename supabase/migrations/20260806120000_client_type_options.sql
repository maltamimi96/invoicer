-- Customer type per industry, overridable per business.
--
-- customers.account_type was CHECK-constrained to a trades vocabulary
-- (residential / strata / builder / property_mgmt …). An agency picking a
-- client type was offered "Strata company", which is meaningless to them.
--
-- The valid set is now per-business, so a single global CHECK can no longer
-- express it: dropping the constraint moves that validation into the app,
-- where the option list actually lives. Existing rows keep their values —
-- nothing is rewritten, and a legacy value stays selectable on the customer
-- that holds it.

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_account_type_check;

-- NULL = use the industry preset's list. A stored array overrides it, exactly
-- like businesses.customer_field_schema.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS customer_type_options JSONB;

COMMENT ON COLUMN public.businesses.customer_type_options IS
  'Client type options [{value,label,hint}]. NULL = the industry preset''s defaults.';

COMMENT ON COLUMN public.customers.account_type IS
  'Client type. Free text, validated against the business''s configured list '
  '(see lib/customers/account-types.ts) rather than a global CHECK.';
