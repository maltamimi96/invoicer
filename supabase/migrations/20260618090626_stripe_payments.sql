-- Stripe Connect Standard + invoice payments.
-- Each business links its own Stripe account; customers pay direct into it.
-- Webhook reconciles back to the payments table; existing addPayment() rollup
-- (and the trg_reconcile_parent_invoice trigger) keep parent invoices in sync.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS stripe_account_id        text,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_country           text,
  -- NULL = fall back to STRIPE_PLATFORM_FEE_PERCENT env default.
  ADD COLUMN IF NOT EXISTS platform_fee_percent     numeric(5,2);

CREATE UNIQUE INDEX IF NOT EXISTS businesses_stripe_account_id_uniq
  ON public.businesses (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider              text,           -- 'stripe' or NULL (= manual)
  ADD COLUMN IF NOT EXISTS provider_payment_id   text,           -- pi_…
  ADD COLUMN IF NOT EXISTS provider_session_id   text,           -- cs_…
  ADD COLUMN IF NOT EXISTS provider_fee          numeric(12,2),  -- Stripe processing fee
  ADD COLUMN IF NOT EXISTS provider_platform_fee numeric(12,2);  -- Kirei application_fee

-- Webhook idempotency: receiving the same event twice must not double-insert.
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_uniq
  ON public.payments (business_id, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
