-- Materials get a sell price alongside the base cost, so the catalog can be the
-- source for quoting: cost_price = what we pay (base cost), sell_price = what we
-- charge. Line items pull the sell price.
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS sell_price numeric(12,2) NOT NULL DEFAULT 0;

-- Seed sell_price from cost_price for existing rows so nothing is 0 until edited.
UPDATE public.materials SET sell_price = cost_price WHERE sell_price = 0 AND cost_price > 0;
