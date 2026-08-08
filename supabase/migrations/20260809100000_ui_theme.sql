-- Which of the Kirei Dashboard v2 palettes a business uses.
--
-- Midnight / Daylight / Azure / Orchid, from the Claude Design project. Light
-- vs dark is a property of the theme itself (Daylight is the light one), so
-- this replaces the separate dark-mode question rather than sitting beside it.
--
-- Defaults to Midnight, matching the design's own default. Existing businesses
-- get Midnight too: the previous 'console' theme is retired, not offered.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS ui_theme TEXT NOT NULL DEFAULT 'Midnight';

COMMENT ON COLUMN public.businesses.ui_theme IS
  'Kirei Dashboard v2 palette: Midnight | Daylight | Azure | Orchid.';
