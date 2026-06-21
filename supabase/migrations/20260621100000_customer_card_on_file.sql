-- Card-on-file / autopay for customers (Stripe Connect, direct charges).
-- The Stripe Customer + saved payment method live on the BUSINESS's connected
-- account (that's where direct charges happen), so these ids are scoped to that
-- account, not the platform.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,   -- cus_… on the connected account
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT,   -- pm_… default saved card
  ADD COLUMN IF NOT EXISTS stripe_pm_brand          TEXT,   -- e.g. "visa" (display only)
  ADD COLUMN IF NOT EXISTS stripe_pm_last4          TEXT,   -- e.g. "4242" (display only)
  ADD COLUMN IF NOT EXISTS stripe_pm_exp            TEXT,   -- e.g. "12/34" (display only)
  -- Customer consented to automatic charging of their invoices to the card.
  ADD COLUMN IF NOT EXISTS autopay_enabled          BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_customers_stripe_customer_id
  ON public.customers (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
