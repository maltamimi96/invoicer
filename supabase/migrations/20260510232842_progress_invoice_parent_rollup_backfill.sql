-- ============================================================================
-- Backfill: parent invoices of progress-billed jobs should reflect everything
-- collected toward the job (direct payments + sum of children's amount_paid).
--
-- Prior to the addPayment fix that lands with this migration, paying a
-- child deposit invoice did not update the parent's amount_paid or flip the
-- parent to 'partial'. Run this once to reconcile existing data.
--
-- Idempotent — safe to re-run.
-- ============================================================================

UPDATE public.invoices p
SET
  amount_paid = COALESCE(rollup.total_collected, 0),
  status = CASE
    -- Don't fight cancelled / draft
    WHEN p.status IN ('cancelled', 'draft')                                       THEN p.status
    WHEN COALESCE(rollup.total_collected, 0) >= p.total - 0.01                    THEN 'paid'
    WHEN COALESCE(rollup.total_collected, 0) >  0.01                              THEN 'partial'
    ELSE p.status
  END
FROM (
  SELECT
    parent.id AS parent_id,
    COALESCE((
      SELECT SUM(pay.amount)
      FROM   public.payments pay
      WHERE  pay.invoice_id = parent.id
    ), 0)
    + COALESCE((
      SELECT SUM(child.amount_paid)
      FROM   public.invoices child
      WHERE  child.parent_invoice_id = parent.id
    ), 0)
    AS total_collected
  FROM public.invoices parent
  WHERE EXISTS (
    SELECT 1 FROM public.invoices c WHERE c.parent_invoice_id = parent.id
  )
) AS rollup
WHERE p.id = rollup.parent_id
  AND (
    -- Only touch rows that are genuinely out of sync to keep the migration cheap
    p.amount_paid IS DISTINCT FROM COALESCE(rollup.total_collected, 0)
    OR (
      COALESCE(rollup.total_collected, 0) >= p.total - 0.01
      AND p.status NOT IN ('paid', 'cancelled', 'draft')
    )
    OR (
      COALESCE(rollup.total_collected, 0) > 0.01
      AND COALESCE(rollup.total_collected, 0) < p.total - 0.01
      AND p.status NOT IN ('partial', 'cancelled', 'draft')
    )
  );
