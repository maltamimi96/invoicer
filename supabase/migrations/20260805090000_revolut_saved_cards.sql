-- Revolut saved cards — a card-on-file path that doesn't depend on Stripe.
--
-- Mirrors the existing stripe_* columns rather than generalising them: the two
-- providers' tokens are not interchangeable, and a business may have both
-- connected during a migration. Keeping them side by side means switching
-- provider never destroys the other one's saved cards.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS revolut_customer_id       TEXT,
  ADD COLUMN IF NOT EXISTS revolut_payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS revolut_pm_brand          TEXT,
  ADD COLUMN IF NOT EXISTS revolut_pm_last4          TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_revolut_pm
  ON public.customers (business_id, revolut_payment_method_id)
  WHERE revolut_payment_method_id IS NOT NULL;

-- Which provider a business takes card payments through. 'auto' picks whichever
-- is actually connected, preferring Stripe when both are — so nothing changes
-- for businesses already on Stripe.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS card_provider TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_card_provider_ck;
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_card_provider_ck
  CHECK (card_provider IN ('auto', 'stripe', 'revolut'));
