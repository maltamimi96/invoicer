-- Assets & equipment plugin (field-services). Track tools/vehicles/equipment,
-- assignment, and service schedules. Additive.
CREATE TABLE IF NOT EXISTS public.assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'tool' CHECK (category IN ('tool','vehicle','equipment','other')),
  identifier    TEXT,                          -- serial / rego / asset tag
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','in_repair','retired')),
  assigned_to   UUID REFERENCES public.member_profiles(id) ON DELETE SET NULL,
  purchase_date DATE,
  purchase_cost NUMERIC,
  next_service_on DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assets_business ON public.assets (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_service ON public.assets (business_id, next_service_on);

CREATE TABLE IF NOT EXISTS public.asset_service_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  asset_id    UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  serviced_on DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  cost        NUMERIC,
  next_due    DATE,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_logs_asset ON public.asset_service_logs (asset_id, serviced_on DESC);

DO $$
DECLARE tb TEXT;
BEGIN
  FOREACH tb IN ARRAY ARRAY['assets','asset_service_logs'] LOOP
    EXECUTE format('ALTER TABLE public.%1$s ENABLE ROW LEVEL SECURITY;', tb);
    EXECUTE format($f$
      DROP POLICY IF EXISTS %1$s_read ON public.%1$s;
      CREATE POLICY %1$s_read ON public.%1$s FOR SELECT USING (
        business_id IN (
          SELECT id FROM public.businesses WHERE user_id = auth.uid()
          UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
        ) AND NOT public.is_business_worker(business_id)
      );
      DROP POLICY IF EXISTS %1$s_write ON public.%1$s;
      CREATE POLICY %1$s_write ON public.%1$s FOR ALL USING (
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
    $f$, tb);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS assets_updated_at ON public.assets;
CREATE TRIGGER assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
