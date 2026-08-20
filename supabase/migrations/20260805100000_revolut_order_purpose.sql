-- revolut_orders needs to remember WHY an order was created.
--
-- Until now every Revolut order was an invoice payment, so the webhook could
-- assume that. A save-card order is a payment too, but it additionally yields a
-- reusable payment-method token — and the webhook can only know to store that
-- if the order says so. Without `purpose` a saved card would be silently
-- dropped and the customer would have paid for nothing.
ALTER TABLE public.revolut_orders
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purpose     TEXT NOT NULL DEFAULT 'invoice';

ALTER TABLE public.revolut_orders
  DROP CONSTRAINT IF EXISTS revolut_orders_purpose_ck;
ALTER TABLE public.revolut_orders
  ADD CONSTRAINT revolut_orders_purpose_ck
  CHECK (purpose IN ('invoice', 'save_card'));
