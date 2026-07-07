-- Industry preset chosen at signup (or later from the Plugins page).
-- Additive + nullable: existing businesses keep NULL (= no preset applied,
-- registry defaults in effect) and lose nothing.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS industry_preset TEXT;
