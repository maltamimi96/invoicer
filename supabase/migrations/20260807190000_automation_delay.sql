-- "Wait, then do it."
--
-- The run table already carried run_at, so the delay is the only thing
-- missing: emit sets run_at = now() + delay, and the runner's existing
-- `run_at <= now()` filter does the rest. No new machinery.
--
-- Rule-level rather than per-action: "wait 3 days then text them" is the shape
-- people actually want. Per-action waits mean a run that sits half-finished,
-- which needs a step pointer and a resume path — worth it only if someone
-- genuinely needs a sequence.

ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS delay_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.automations
  DROP CONSTRAINT IF EXISTS automations_delay_check;
-- Up to 90 days. Longer isn't a follow-up, it's a forgotten row.
ALTER TABLE public.automations
  ADD CONSTRAINT automations_delay_check
  CHECK (delay_minutes >= 0 AND delay_minutes <= 129600);

COMMENT ON COLUMN public.automations.delay_minutes IS
  'Minutes to wait after the trigger before running. 0 = immediately.';
