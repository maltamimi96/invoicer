-- Deposit percentage a customer pays up-front when accepting a quote by card.
-- NULL → fall back to the app default (50%). 0 disables the deposit option.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS deposit_percent numeric(5,2);
