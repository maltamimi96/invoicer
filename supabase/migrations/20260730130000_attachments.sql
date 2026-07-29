-- Generic file attachments: documents (material invoices, receipts, PDFs,
-- images) attached to any record — customers, work orders, invoices, quotes,
-- leads. Private storage; served via signed URLs. Additive.
CREATE TABLE IF NOT EXISTS public.attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL,   -- 'customer' | 'work_order' | 'invoice' | 'quote' | 'lead'
  entity_id    UUID NOT NULL,
  name         TEXT NOT NULL,   -- original filename / label
  path         TEXT NOT NULL,   -- storage object path
  mime_type    TEXT,
  size_bytes   BIGINT,
  uploaded_by  UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON public.attachments (business_id, entity_type, entity_id, created_at DESC);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attachments_read ON public.attachments;
CREATE POLICY attachments_read ON public.attachments FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);
DROP POLICY IF EXISTS attachments_write ON public.attachments;
CREATE POLICY attachments_write ON public.attachments FOR ALL USING (
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

INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;
