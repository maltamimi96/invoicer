-- A client's bank details, for direct debit.
--
-- BSB and account number are stored ENCRYPTED (AES-256-GCM, the same
-- ONBOARDING_SECRET_KEY path the onboarding secure fields use). They are not
-- card data, so no PCI scope, but they still move money out of someone's
-- account — plaintext in a multi-tenant table is not good enough.
--
-- bank_account_last3 is a plaintext display hint so the UI can show
-- "···· 321" without decrypting anything. Three digits, not four: an
-- Australian account number can be as short as six, and exposing four of six
-- gives away most of it.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS bank_account_name    TEXT,
  ADD COLUMN IF NOT EXISTS bank_bsb_enc         TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_enc     TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_last3   TEXT;

COMMENT ON COLUMN public.customers.bank_bsb_enc IS
  'BSB, AES-256-GCM encrypted (lib/onboarding/crypto.ts). Never store in the clear.';
COMMENT ON COLUMN public.customers.bank_account_enc IS
  'Account number, AES-256-GCM encrypted. Revealable by owner/admin only.';
COMMENT ON COLUMN public.customers.bank_account_last3 IS
  'Last 3 digits, plaintext, for display only.';
