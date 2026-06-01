-- Backfill: every photo a worker uploaded via mobile lives in
-- work_orders.photos (JSONB), but the web admin / customer portal / job-share
-- page / PDF all read from the canonical job_photos table. Worker photos are
-- therefore invisible everywhere outside the mobile app.
--
-- This migration copies each existing work_orders.photos entry into job_photos
-- (skipping rows that already exist by URL, so re-running is safe). Going
-- forward, mobile inserts directly into job_photos.
INSERT INTO public.job_photos (business_id, work_order_id, url, taken_at)
SELECT w.business_id, w.id, p->>'url',
       COALESCE(NULLIF(p->>'taken_at','')::timestamptz, NOW())
  FROM public.work_orders w,
       jsonb_array_elements(COALESCE(w.photos, '[]'::jsonb)) p
 WHERE jsonb_typeof(COALESCE(w.photos, '[]'::jsonb)) = 'array'
   AND p ? 'url'
   AND NOT EXISTS (
     SELECT 1 FROM public.job_photos jp
      WHERE jp.work_order_id = w.id AND jp.url = p->>'url'
   );
