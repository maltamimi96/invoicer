-- Materials plugin — a per-business catalog of materials with COST prices,
-- used as an internal cost reference. Structural clone of public.products
-- (which holds RETAIL/sell prices), gated behind the "materials" plugin.

CREATE TABLE IF NOT EXISTS public.materials (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  sku          TEXT,
  supplier     TEXT,
  cost_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate     NUMERIC(5,2) NOT NULL DEFAULT 20,
  unit         TEXT,
  archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_materials_business ON public.materials (business_id, name);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- Mirror the products_no_workers policy exactly: owner or active member, and
-- never a worker (materials/cost data is admin-side).
DROP POLICY IF EXISTS "materials_no_workers" ON public.materials;
CREATE POLICY "materials_no_workers" ON public.materials
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
    )
    AND NOT public.is_business_worker(business_id)
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
    )
    AND NOT public.is_business_worker(business_id)
  );

DROP TRIGGER IF EXISTS materials_updated_at ON public.materials;
CREATE TRIGGER materials_updated_at BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
