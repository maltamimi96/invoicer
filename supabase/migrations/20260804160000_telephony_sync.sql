-- Sync + click-to-call support.
ALTER TABLE public.telephony_settings
  ADD COLUMN IF NOT EXISTS last_sync_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  -- Extension calls are placed FROM. Click-to-call rings this first.
  ADD COLUMN IF NOT EXISTS default_user_number TEXT,
  ADD COLUMN IF NOT EXISTS default_caller_id   TEXT;
