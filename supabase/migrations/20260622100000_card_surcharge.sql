-- Optional card surcharge — pass the card processing fee to the customer.
-- Business is responsible for keeping the rate compliant (surcharging is
-- regulated/banned in some regions). Off by default.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS card_surcharge_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS card_surcharge_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_surcharge_fixed   NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_surcharge_note    TEXT;
