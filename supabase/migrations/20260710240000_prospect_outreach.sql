-- Prospects outreach (PR3): activity timeline, unsubscribe suppression, and a
-- per-prospect unsubscribe token. Additive.
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS unsub_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_unsub ON public.prospects (unsub_token) WHERE unsub_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.prospect_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'note' CHECK (type IN ('note','email','status','import','unsubscribe')),
  summary     TEXT NOT NULL,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prospect_activities ON public.prospect_activities (prospect_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.prospect_suppressions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospect_suppressions ON public.prospect_suppressions (business_id, lower(email));

DO $$
DECLARE tb TEXT;
BEGIN
  FOREACH tb IN ARRAY ARRAY['prospect_activities','prospect_suppressions'] LOOP
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
