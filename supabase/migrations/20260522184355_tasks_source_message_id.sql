-- Let the email agent create tasks from action-required emails without
-- duplicating them on every re-scan. Mirrors leads.source_message_id.

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source_message_id TEXT;

-- One task per (business, email). Partial unique so manually-created tasks
-- (NULL source) are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_business_source_msg_uidx
  ON public.tasks (business_id, source_message_id)
  WHERE source_message_id IS NOT NULL;
