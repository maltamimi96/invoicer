-- Make job_photos the single source of truth for work-order photos, and turn
-- work_orders.photos into a derived mirror.
--
-- THE BUG THIS FIXES (observed in production):
--   1. Web deletes a photo  -> row removed from job_photos. The JSONB still
--      holds it, because the web never wrote the JSONB.
--   2. Phone uploads a new photo -> addWorkOrderPhoto read the STALE JSONB,
--      appended, and wrote the whole array back.
--   3. trg_sync_wo_photos fired on UPDATE OF work_orders.photos and re-inserted
--      every JSONB url missing from job_photos.
--   => Every previously deleted photo came back to life.
--
-- The sync ran from the stale store INTO the canonical one, so any drift was
-- replayed as truth. Inverting it means the JSONB can never reintroduce a row:
-- it is written only by this trigger, and only from job_photos.
--
-- work_orders.photos is kept (not dropped) because the web still READS it for
-- the photo-count badge on the work-orders list and the customer detail page.
-- It is now derived, so those counts stop lying too.

-- ── 1. Remove the resurrection vector ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_wo_photos ON public.work_orders;
DROP FUNCTION IF EXISTS public.sync_wo_photos_to_job_photos();

-- ── 2. Mirror job_photos -> work_orders.photos ──────────────────────────────
CREATE OR REPLACE FUNCTION public.mirror_job_photos_to_wo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_wo UUID;
BEGIN
  -- DELETE gives us OLD; INSERT/UPDATE give us NEW.
  target_wo := COALESCE(NEW.work_order_id, OLD.work_order_id);
  IF target_wo IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Rebuild the whole array from canonical rows. A full rebuild rather than an
  -- incremental patch: it is cheap at these volumes and it cannot drift.
  UPDATE public.work_orders w
     SET photos = COALESCE((
           SELECT jsonb_agg(
                    jsonb_build_object(
                      'url', jp.url,
                      'caption', jp.caption,
                      'phase', jp.phase,
                      'taken_at', jp.taken_at
                    ) ORDER BY jp.created_at
                  )
             FROM public.job_photos jp
            WHERE jp.work_order_id = target_wo
         ), '[]'::jsonb)
   WHERE w.id = target_wo;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_mirror_job_photos
AFTER INSERT OR UPDATE OR DELETE ON public.job_photos
FOR EACH ROW EXECUTE FUNCTION public.mirror_job_photos_to_wo();

-- ── 3. Backfill: make every JSONB match canonical right now ─────────────────
-- Clears orphans left behind by the old one-way sync, so no work order is
-- carrying a photo the canonical table doesn't have.
UPDATE public.work_orders w
   SET photos = COALESCE((
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'url', jp.url,
                    'caption', jp.caption,
                    'phase', jp.phase,
                    'taken_at', jp.taken_at
                  ) ORDER BY jp.created_at
                )
           FROM public.job_photos jp
          WHERE jp.work_order_id = w.id
       ), '[]'::jsonb)
 WHERE COALESCE(jsonb_array_length(w.photos), 0) > 0
    OR EXISTS (SELECT 1 FROM public.job_photos jp WHERE jp.work_order_id = w.id);
