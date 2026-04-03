-- Work Orders: field workers submit photos → AI generates scope of work

-- 1. Work order counter on businesses
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS work_order_prefix        TEXT    NOT NULL DEFAULT 'WO',
  ADD COLUMN IF NOT EXISTS work_order_next_number   INTEGER NOT NULL DEFAULT 1;

-- 2. work_orders table
CREATE TABLE public.work_orders (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES auth.users(id),
  number              TEXT        NOT NULL,
  title               TEXT        NOT NULL,
  description         TEXT,
  customer_id         UUID        REFERENCES public.customers(id) ON DELETE SET NULL,
  property_address    TEXT,
  status              TEXT        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','assigned','in_progress','submitted','reviewed','completed','cancelled')),
  assigned_to         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_email   TEXT,
  scope_of_work       TEXT,
  scheduled_date      DATE,
  photos              JSONB       NOT NULL DEFAULT '[]',
  worker_notes        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Updated-at trigger
CREATE TRIGGER handle_updated_at_work_orders
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- 4. RLS — same pattern as other data tables
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_orders_all" ON public.work_orders
  FOR ALL
  USING (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ));

-- 5. Storage bucket for work-order photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('work-order-photos', 'work-order-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "work_order_photos_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'work-order-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "work_order_photos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'work-order-photos');

CREATE POLICY "work_order_photos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'work-order-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
