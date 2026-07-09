-- Expenses & job costing plugin (field-services). Track business + job costs
-- (materials, fuel, subcontractors, hire…) with a receipt, optionally linked to
-- a work order for true profit-per-job. Additive.
CREATE TABLE IF NOT EXISTS public.expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id       UUID,
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  vendor        TEXT,
  category      TEXT NOT NULL DEFAULT 'other',
  description   TEXT,
  amount        NUMERIC NOT NULL DEFAULT 0,   -- ex-tax
  tax_amount    NUMERIC NOT NULL DEFAULT 0,
  spent_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,                         -- card | cash | bank | other
  billable      BOOLEAN NOT NULL DEFAULT FALSE,
  reimbursable  BOOLEAN NOT NULL DEFAULT FALSE,
  receipt_path  TEXT,
  status        TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','reimbursed','invoiced')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_business ON public.expenses (business_id, spent_on DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_work_order ON public.expenses (work_order_id);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expenses_read ON public.expenses;
CREATE POLICY expenses_read ON public.expenses FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);
DROP POLICY IF EXISTS expenses_write ON public.expenses;
CREATE POLICY expenses_write ON public.expenses FOR ALL USING (
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

DROP TRIGGER IF EXISTS expenses_updated_at ON public.expenses;
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO storage.buckets (id, name, public) VALUES ('expense-receipts', 'expense-receipts', false)
ON CONFLICT (id) DO NOTHING;
