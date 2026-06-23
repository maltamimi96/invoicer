-- Self-healing photo sync: work_orders.photos (legacy JSONB, still written by
-- older mobile builds with no OTA updates) → public.job_photos (canonical table
-- the web admin / customer portal / PDFs / MCP all read).
--
-- A one-time backfill (20260601000001) already ran, but workers on un-updated
-- app builds keep inserting into work_orders.photos only, so their photos stay
-- invisible everywhere outside the mobile app (photo_count shows 0). This adds a
-- DB trigger so the sync happens server-side regardless of client version, plus
-- a reconciling backfill for everything currently orphaned.
--
-- Insert-only by design: photos added directly to job_photos by the web admin
-- are NOT mirrored back into work_orders.photos, so we must never delete from
-- job_photos based on the JSONB array (that would wipe web-added photos).

CREATE OR REPLACE FUNCTION public.sync_wo_photos_to_job_photos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF jsonb_typeof(COALESCE(NEW.photos, '[]'::jsonb)) <> 'array' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.job_photos (business_id, work_order_id, url, phase, taken_at)
  SELECT NEW.business_id, NEW.id, p->>'url',
         CASE lower(COALESCE(p->>'phase', ''))
           WHEN 'before'    THEN 'before'
           WHEN 'after'     THEN 'after'
           WHEN 'reference' THEN 'reference'
           ELSE 'during'   -- maps legacy 'progress'/'' and anything unexpected
         END,
         COALESCE(NULLIF(p->>'taken_at', '')::timestamptz, NOW())
    FROM jsonb_array_elements(NEW.photos) p
   WHERE p ? 'url'
     AND COALESCE(p->>'url', '') <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.job_photos jp
        WHERE jp.work_order_id = NEW.id AND jp.url = p->>'url'
     );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_wo_photos ON public.work_orders;
CREATE TRIGGER trg_sync_wo_photos
AFTER INSERT OR UPDATE OF photos ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_wo_photos_to_job_photos();

-- Reconcile everything currently orphaned (idempotent — skips URLs already present).
INSERT INTO public.job_photos (business_id, work_order_id, url, phase, taken_at)
SELECT w.business_id, w.id, p->>'url',
       CASE lower(COALESCE(p->>'phase', ''))
         WHEN 'before'    THEN 'before'
         WHEN 'after'     THEN 'after'
         WHEN 'reference' THEN 'reference'
         ELSE 'during'
       END,
       COALESCE(NULLIF(p->>'taken_at', '')::timestamptz, NOW())
  FROM public.work_orders w,
       jsonb_array_elements(COALESCE(w.photos, '[]'::jsonb)) p
 WHERE jsonb_typeof(COALESCE(w.photos, '[]'::jsonb)) = 'array'
   AND p ? 'url'
   AND COALESCE(p->>'url', '') <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.job_photos jp
      WHERE jp.work_order_id = w.id AND jp.url = p->>'url'
   );
