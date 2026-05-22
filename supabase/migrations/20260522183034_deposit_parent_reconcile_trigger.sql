-- Deposit / progress-invoice parent reconciliation trigger.
--
-- Problem: a deposit is a child invoice (parent_invoice_id set). The app-code
-- rollup in addPayment() only fires when you *record a payment*. Marking the
-- deposit "paid" via the status dropdown (updateInvoice), the MCP
-- mark_invoice_paid / set_invoice_status, or any direct write bypassed it — so
-- the parent never reflected the paid deposit (it wasn't "deducted").
--
-- Fix: a trigger that recomputes the PARENT's amount_paid + status whenever any
-- child invoice changes. Parent.amount_paid = direct payments on the parent +
-- sum of every child's amount_paid. This makes the parent correct no matter how
-- the child's paid state was changed. (App code still sets the child's
-- amount_paid = total when marking paid; this trigger propagates it up.)

CREATE OR REPLACE FUNCTION public.reconcile_parent_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent    UUID;
  v_total     NUMERIC;
  v_status    TEXT;
  v_collected NUMERIC;
BEGIN
  -- Which parent (if any) does the changed row belong to?
  v_parent := COALESCE(NEW.parent_invoice_id, OLD.parent_invoice_id);
  IF v_parent IS NULL THEN
    RETURN NULL;  -- not a child invoice; nothing to roll up
  END IF;

  SELECT total, status INTO v_total, v_status FROM invoices WHERE id = v_parent;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Everything collected toward the parent job: direct payments on the parent
  -- plus what each child invoice has collected.
  SELECT
    COALESCE((SELECT SUM(amount)      FROM payments WHERE invoice_id = v_parent), 0)
  + COALESCE((SELECT SUM(amount_paid) FROM invoices WHERE parent_invoice_id = v_parent), 0)
  INTO v_collected;

  UPDATE invoices
     SET amount_paid = v_collected,
         status = CASE
                    WHEN status IN ('cancelled', 'draft') THEN status
                    WHEN v_collected >= v_total - 0.01     THEN 'paid'
                    WHEN v_collected > 0.01                THEN 'partial'
                    ELSE status
                  END
   WHERE id = v_parent;
  -- The UPDATE above re-fires this trigger on the parent row, but the parent has
  -- no parent_invoice_id so it returns early — no recursion.

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconcile_parent_invoice ON public.invoices;
CREATE TRIGGER trg_reconcile_parent_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.reconcile_parent_invoice();

-- Backfill: reconcile every existing parent that has children.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT parent_invoice_id AS id FROM invoices WHERE parent_invoice_id IS NOT NULL LOOP
    UPDATE invoices p
       SET amount_paid = COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = r.id), 0)
                       + COALESCE((SELECT SUM(amount_paid) FROM invoices WHERE parent_invoice_id = r.id), 0),
           status = CASE
                      WHEN p.status IN ('cancelled','draft') THEN p.status
                      WHEN (COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = r.id), 0)
                          + COALESCE((SELECT SUM(amount_paid) FROM invoices WHERE parent_invoice_id = r.id), 0)) >= p.total - 0.01 THEN 'paid'
                      WHEN (COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = r.id), 0)
                          + COALESCE((SELECT SUM(amount_paid) FROM invoices WHERE parent_invoice_id = r.id), 0)) > 0.01 THEN 'partial'
                      ELSE p.status
                    END
     WHERE p.id = r.id;
  END LOOP;
END $$;
