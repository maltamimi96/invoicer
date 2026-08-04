-- Telephony: make the webhook connection observable, and repair the toggle.
--
-- Two problems this fixes.
--
-- 1. Enabling the plugin in the store set business_agent_installs.telephony but
--    NOT telephony_settings.enabled, because `telephony` was missing from
--    syncPluginSideEffects. The nav item appeared while the webhook kept
--    answering 404, so every call event was dropped. Backfilled below.
--
-- 2. There was no way to tell a connected-but-quiet webhook from one that was
--    never configured — both looked like an empty call list. These columns let
--    the UI say which it is, including counting requests that were REJECTED,
--    so a wrong secret is visible rather than silent.

ALTER TABLE public.telephony_settings
  ADD COLUMN IF NOT EXISTS last_event_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_event_type    TEXT,
  ADD COLUMN IF NOT EXISTS last_error_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error         TEXT,
  ADD COLUMN IF NOT EXISTS events_received    INT NOT NULL DEFAULT 0;

-- Repair businesses that enabled the plugin before the sync existed.
UPDATE public.telephony_settings ts
   SET enabled = TRUE
  FROM public.business_agent_installs bai
 WHERE bai.business_id = ts.business_id
   AND bai.agent_id = 'telephony'
   AND bai.enabled
   AND NOT ts.enabled;

-- And create the row for anyone who installed the plugin but never opened the
-- setup tab (the row is created lazily on first visit).
INSERT INTO public.telephony_settings (business_id, enabled)
SELECT bai.business_id, TRUE
  FROM public.business_agent_installs bai
 WHERE bai.agent_id = 'telephony' AND bai.enabled
ON CONFLICT (business_id) DO NOTHING;
