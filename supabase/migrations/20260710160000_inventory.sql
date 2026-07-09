-- Inventory & stock plugin (field-services). Extends products with stock
-- tracking + a movements ledger. Additive.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_stock   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stock_qty     NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_point NUMERIC,
  ADD COLUMN IF NOT EXISTS unit_cost     NUMERIC;

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  delta         NUMERIC NOT NULL,
  reason        TEXT NOT NULL DEFAULT 'adjustment' CHECK (reason IN ('adjustment','received','usage','count')),
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  note          TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_business ON public.stock_movements (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements (product_id, created_at DESC);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_movements_read ON public.stock_movements;
CREATE POLICY stock_movements_read ON public.stock_movements FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);
DROP POLICY IF EXISTS stock_movements_write ON public.stock_movements;
CREATE POLICY stock_movements_write ON public.stock_movements FOR ALL USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active' AND role IN ('admin','editor')
  )
) WITH CHECK (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active' AND role IN ('admin','editor')
  )
);
