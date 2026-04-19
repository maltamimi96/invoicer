-- Track which time entries / materials have been billed onto an invoice
ALTER TABLE public.job_time_entries
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;

ALTER TABLE public.job_materials
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS job_time_entries_invoice_id_idx ON public.job_time_entries (invoice_id);
CREATE INDEX IF NOT EXISTS job_materials_invoice_id_idx ON public.job_materials (invoice_id);
