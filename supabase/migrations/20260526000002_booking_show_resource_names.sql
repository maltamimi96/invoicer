-- Booking: option to show or hide the resource/worker name on the public form.
-- (Resources already support worker-linked OR generic via nullable
--  booking_resources.member_profile_id — no schema change needed there.)
ALTER TABLE public.booking_settings
  ADD COLUMN IF NOT EXISTS show_resource_names BOOLEAN NOT NULL DEFAULT TRUE;
