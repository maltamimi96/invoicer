-- Automatic recurring billing.
--  (A) recurring_invoices: subscription-style schedules that auto-generate an
--      invoice each cycle and (optionally) auto-charge the customer's saved card.
--  (B) billing fields on recurring_jobs so a generated job can also auto-invoice
--      + auto-charge.

-- ---------------------------------------------------------------------------
-- (A) recurring_invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  line_items      JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  terms           TEXT,
  cadence         TEXT NOT NULL CHECK (cadence IN ('weekly','fortnightly','monthly','quarterly')),
  preferred_day_of_month INT CHECK (preferred_day_of_month BETWEEN 1 AND 28),
  due_days        INT NOT NULL DEFAULT 14,
  next_run_on     DATE NOT NULL,
  ends_on         DATE,
  -- Charge the customer's saved card off-session when the invoice is generated.
  auto_charge     BOOLEAN NOT NULL DEFAULT TRUE,
  -- Email the invoice (with a pay link) when it's generated / when auto-charge
  -- isn't possible.
  send_email      BOOLEAN NOT NULL DEFAULT TRUE,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  last_invoice_id UUID,
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recurring_invoices_business_idx ON public.recurring_invoices (business_id);
CREATE INDEX IF NOT EXISTS recurring_invoices_next_idx ON public.recurring_invoices (next_run_on) WHERE active = true;

ALTER TABLE public.recurring_invoices ENABLE ROW LEVEL SECURITY;

-- Read: any active member, but not workers (billing is hidden from workers).
DROP POLICY IF EXISTS recurring_invoices_read ON public.recurring_invoices;
CREATE POLICY recurring_invoices_read ON public.recurring_invoices FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
     WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);

-- Write: owner / admin / editor.
DROP POLICY IF EXISTS recurring_invoices_write ON public.recurring_invoices;
CREATE POLICY recurring_invoices_write ON public.recurring_invoices FOR ALL USING (
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

DROP TRIGGER IF EXISTS recurring_invoices_updated_at ON public.recurring_invoices;
CREATE TRIGGER recurring_invoices_updated_at BEFORE UPDATE ON public.recurring_invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- (B) recurring_jobs billing
-- ---------------------------------------------------------------------------
ALTER TABLE public.recurring_jobs
  ADD COLUMN IF NOT EXISTS auto_invoice       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invoice_line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_charge        BOOLEAN NOT NULL DEFAULT FALSE;
