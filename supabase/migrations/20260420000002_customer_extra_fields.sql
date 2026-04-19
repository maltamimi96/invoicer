-- Expand account_type values + add extra contact fields

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_account_type_check;
ALTER TABLE customers
  ADD CONSTRAINT customers_account_type_check
  CHECK (account_type IN (
    'residential','commercial','developer','agent','builder',
    'strata','property_mgmt','government','non_profit','other',
    -- legacy
    'individual'
  ));

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS secondary_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_role TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact TEXT
    CHECK (preferred_contact IS NULL OR preferred_contact IN ('email','phone','sms','any'));
