-- ============================================================================
-- Progress / deposit invoicing
--
-- Adds parent_invoice_id so a "master" invoice can be split into smaller child
-- invoices (deposit + remainder, or arbitrary milestones). The parent stays the
-- source of truth for the full job total; children carry whatever portion is
-- being billed right now and link back to the parent.
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS parent_invoice_id UUID
  REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invoices_parent_idx
  ON public.invoices (parent_invoice_id)
  WHERE parent_invoice_id IS NOT NULL;
