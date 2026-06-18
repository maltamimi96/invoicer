-- Work-order templates — predefined starting points for new work orders
-- (e.g. "Inspection", "Rectification"). Admin / editor creates a template;
-- when creating a new work order, the user can pick a template to prefill the
-- common text fields, or start blank.
CREATE TABLE IF NOT EXISTS public.work_order_templates (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id              UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  -- Field defaults pushed into the new work order when this template is used.
  title                    TEXT,
  description              TEXT,
  scope_of_work            TEXT,
  worker_notes             TEXT,
  reported_issue           TEXT,
  default_duration_minutes INTEGER,
  sort_order               INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wo_templates_business
  ON public.work_order_templates (business_id, sort_order);

ALTER TABLE public.work_order_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_templates_read ON public.work_order_templates;
CREATE POLICY wo_templates_read ON public.work_order_templates FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
     WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);

DROP POLICY IF EXISTS wo_templates_write ON public.work_order_templates;
CREATE POLICY wo_templates_write ON public.work_order_templates FOR ALL USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
     WHERE user_id = auth.uid() AND status='active' AND role IN ('admin','editor')
  )
) WITH CHECK (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
     WHERE user_id = auth.uid() AND status='active' AND role IN ('admin','editor')
  )
);

DROP TRIGGER IF EXISTS wo_templates_updated_at ON public.work_order_templates;
CREATE TRIGGER wo_templates_updated_at BEFORE UPDATE ON public.work_order_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
