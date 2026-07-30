-- Leads get: per-lead tags (custom + business presets) and a timestamped notes
-- log. Card background colour is derived from status in the UI (no column).

-- ── tags array on the lead ──────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- ── notes log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id     uuid,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_notes_lead_idx ON public.lead_notes (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_notes_business_idx ON public.lead_notes (business_id);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_notes_no_workers" ON public.lead_notes;
CREATE POLICY "lead_notes_no_workers" ON public.lead_notes
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

-- ── business-managed tag presets ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_tag_presets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  label       text NOT NULL,
  color       text,   -- tone key (e.g. "blue") or hex; UI decides rendering
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, label)
);
CREATE INDEX IF NOT EXISTS lead_tag_presets_business_idx ON public.lead_tag_presets (business_id);

ALTER TABLE public.lead_tag_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_tag_presets_no_workers" ON public.lead_tag_presets;
CREATE POLICY "lead_tag_presets_no_workers" ON public.lead_tag_presets
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
