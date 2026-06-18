-- Per-customer allowed payment methods. NULL = offer every method the business
-- supports (card if Stripe connected, bank transfer if bank details set).
-- An explicit array restricts to exactly those (e.g. '{cash}' = cash only).
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS allowed_payment_methods TEXT[] DEFAULT NULL;
