ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS pdf_settings jsonb DEFAULT '{}'::jsonb;
