-- Extend the existing tasks table with tags and optional context links.
-- All four added columns are nullable / default-empty so existing rows are unaffected.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS tags                  TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS related_work_order_id UUID   REFERENCES public.work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_customer_id   UUID   REFERENCES public.customers(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_contact_id    UUID   REFERENCES public.contacts(id)    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_tags_gin           ON public.tasks USING GIN (tags);
CREATE INDEX IF NOT EXISTS tasks_work_order_idx     ON public.tasks (related_work_order_id) WHERE related_work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_customer_idx       ON public.tasks (related_customer_id)   WHERE related_customer_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_contact_idx        ON public.tasks (related_contact_id)    WHERE related_contact_id    IS NOT NULL;
