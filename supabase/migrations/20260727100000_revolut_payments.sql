-- Revolut as a second payment provider (alongside Stripe). Per-business Merchant
-- API credentials, stored encrypted (AES-256-GCM via APP_ENCRYPTION_KEY). Unlike
-- Stripe Connect there's no onboarded account — each business pastes its own
-- Revolut Merchant Secret key, so `revolut_enabled` is the gate (the equivalent
-- of stripe_charges_enabled).

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS revolut_secret_enc         text,  -- encrypted Merchant Secret API key
  ADD COLUMN IF NOT EXISTS revolut_webhook_secret_enc text,  -- encrypted webhook signing secret
  ADD COLUMN IF NOT EXISTS revolut_mode               text NOT NULL DEFAULT 'sandbox', -- 'sandbox' | 'live'
  ADD COLUMN IF NOT EXISTS revolut_enabled            boolean NOT NULL DEFAULT false;

-- The payments table already carries provider-agnostic columns (provider,
-- provider_payment_id, provider_fee, provider_platform_fee) plus the unique
-- index on (business_id, provider_payment_id) — a Revolut order id slots in with
-- no schema change.

-- Maps a Revolut order id -> the invoice/business/portal-token it was created
-- for, so the webhook (which arrives with only an order id) can find the right
-- business, decrypt that business's key, and reconcile the payment.
CREATE TABLE IF NOT EXISTS public.revolut_orders (
  order_id     text PRIMARY KEY,
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id   uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount       numeric(12,2) NOT NULL,
  currency     text NOT NULL,
  portal_token text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS revolut_orders_business_idx ON public.revolut_orders (business_id);

-- Service-role only (written by the token-gated checkout route + read by the
-- webhook, both on the admin client). No client access needed.
ALTER TABLE public.revolut_orders ENABLE ROW LEVEL SECURITY;
