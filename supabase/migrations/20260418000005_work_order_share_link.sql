-- Customer-facing share link for work orders (Job Portfolio)
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS share_enabled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS work_orders_share_token_idx
  ON public.work_orders (share_token)
  WHERE share_token IS NOT NULL;

-- Public read of a single work order via share token (anonymous)
DROP POLICY IF EXISTS "work_orders_public_share_select" ON public.work_orders;
CREATE POLICY "work_orders_public_share_select" ON public.work_orders
  FOR SELECT
  TO anon
  USING (share_token IS NOT NULL);

-- Public read of related job_* tables when parent work_order has an active share token
DROP POLICY IF EXISTS "job_timeline_events_public_share_select" ON public.job_timeline_events;
CREATE POLICY "job_timeline_events_public_share_select" ON public.job_timeline_events
  FOR SELECT TO anon USING (
    visible_to_customer = true
    AND EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = job_timeline_events.work_order_id AND w.share_token IS NOT NULL)
  );

DROP POLICY IF EXISTS "job_photos_public_share_select" ON public.job_photos;
CREATE POLICY "job_photos_public_share_select" ON public.job_photos
  FOR SELECT TO anon USING (
    customer_visible = true
    AND EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = job_photos.work_order_id AND w.share_token IS NOT NULL)
  );

DROP POLICY IF EXISTS "job_documents_public_share_select" ON public.job_documents;
CREATE POLICY "job_documents_public_share_select" ON public.job_documents
  FOR SELECT TO anon USING (
    customer_visible = true
    AND EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = job_documents.work_order_id AND w.share_token IS NOT NULL)
  );

DROP POLICY IF EXISTS "job_signatures_public_share_select" ON public.job_signatures;
CREATE POLICY "job_signatures_public_share_select" ON public.job_signatures
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = job_signatures.work_order_id AND w.share_token IS NOT NULL)
  );
