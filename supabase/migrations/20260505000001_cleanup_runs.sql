-- ============================================================================
-- Cleanup runs audit log
--
-- "Clean up" buttons across the app (customers, contacts, leads, invoices…)
-- generate a list of proposed changes (dedup, normalize, etc.), the user
-- approves them, and we apply them. Every applied run is recorded here with
-- its full change_log so one click on Undo can reverse it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cleanup_runs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id     UUID                 REFERENCES auth.users(id)        ON DELETE SET NULL,
  entity      TEXT        NOT NULL,                                              -- 'customers', 'contacts', 'leads', …
  status      TEXT        NOT NULL DEFAULT 'applied'
                                       CHECK (status IN ('applied', 'undone')),
  -- Each entry: {op:'merge'|'delete'|'update', before:{...}, after:{...}|null,
  --              fk_updates: [{table, id, column, old, new}]}
  change_log  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  summary     TEXT        NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cleanup_runs_business_idx
  ON public.cleanup_runs (business_id, applied_at DESC);

ALTER TABLE public.cleanup_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "cleanup_runs_business" ON public.cleanup_runs FOR ALL
    USING (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION
        SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
      )
    )
    WITH CHECK (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION
        SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
