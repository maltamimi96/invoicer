-- Outreach email design — the look of the emails the agent sends.
--
-- Previously the wrapper (font, width, colours) was hardcoded in the engine, so
-- every business's cold email looked identical and none of it was editable.
-- These columns feed renderOutreachEmail(), which is now the single renderer
-- shared by the cron, "send due now" and the live preview in the builder.
--
-- Additive with defaults matching the previously hardcoded values, so existing
-- businesses see byte-identical output until they change something.

ALTER TABLE public.outreach_settings
  ADD COLUMN IF NOT EXISTS email_font       TEXT    NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS email_accent     TEXT    NOT NULL DEFAULT '#1f4f4a',
  ADD COLUMN IF NOT EXISTS email_text_color TEXT    NOT NULL DEFAULT '#0f172a',
  ADD COLUMN IF NOT EXISTS email_width      INT     NOT NULL DEFAULT 560,
  ADD COLUMN IF NOT EXISTS email_show_logo  BOOLEAN NOT NULL DEFAULT FALSE;

-- Keep the width sane: narrower than 320 breaks on mobile, wider than 900 stops
-- reading like a personal email (which is the whole point of these sends).
ALTER TABLE public.outreach_settings
  DROP CONSTRAINT IF EXISTS outreach_settings_email_width_ck;
ALTER TABLE public.outreach_settings
  ADD CONSTRAINT outreach_settings_email_width_ck
  CHECK (email_width BETWEEN 320 AND 900);
