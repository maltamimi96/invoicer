-- Costs that arrive whether you think about them or not: rent, insurance,
-- software subscriptions, vehicle finance, the phone bill.
--
-- Modelled on recurring_invoices rather than inventing a second cadence
-- system: same cadence vocabulary, same next_run_on/ends_on/active shape, so
-- the runner and the UI read the same way and one bug fix covers both.
--
-- Why this matters beyond convenience: expenses feed job costing and the
-- books. A subscription nobody remembers to enter makes every profit figure
-- flattering, which is the kind of wrong that is worse than missing.

CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- What gets copied onto each generated expense.
  name          TEXT NOT NULL,
  vendor        TEXT,
  category      TEXT NOT NULL DEFAULT 'other',
  description   TEXT,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  tax_amount    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  payment_method TEXT,
  -- A recurring overhead is rarely billable to one job, but a subcontractor
  -- retainer can be — so it is a choice, not an assumption.
  billable      BOOLEAN NOT NULL DEFAULT FALSE,

  cadence       TEXT NOT NULL DEFAULT 'monthly'
                CHECK (cadence IN ('weekly','fortnightly','monthly','quarterly','yearly')),
  -- For monthly-and-longer cadences: which day to land on. 31 on a short
  -- month clamps to the last day rather than skipping it.
  preferred_day_of_month INTEGER CHECK (preferred_day_of_month BETWEEN 1 AND 31),

  next_run_on   DATE NOT NULL,
  ends_on       DATE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,

  last_expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  last_run_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The runner's hot path: what is due today, across every business.
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_due
  ON public.recurring_expenses (next_run_on) WHERE active;
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_business
  ON public.recurring_expenses (business_id, created_at DESC);

-- Which schedule produced an expense, so a generated row can be traced back
-- and a duplicate run can be detected.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurring_expense_id UUID
    REFERENCES public.recurring_expenses(id) ON DELETE SET NULL;

-- One expense per schedule per due date. The cron claims work by advancing
-- next_run_on, but a retry or an overlapping run would otherwise double-post
-- the rent — and a duplicate cost is a wrong profit figure, silently.
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_recurring_once
  ON public.expenses (recurring_expense_id, spent_on)
  WHERE recurring_expense_id IS NOT NULL;

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

-- Read: any active member except workers. Write: owner / admin / editor.
-- Copied from recurring_invoices so the two behave identically.
DROP POLICY IF EXISTS recurring_expenses_read ON public.recurring_expenses;
CREATE POLICY recurring_expenses_read ON public.recurring_expenses FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);
DROP POLICY IF EXISTS recurring_expenses_write ON public.recurring_expenses;
CREATE POLICY recurring_expenses_write ON public.recurring_expenses FOR ALL USING (
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

DROP TRIGGER IF EXISTS recurring_expenses_updated_at ON public.recurring_expenses;
CREATE TRIGGER recurring_expenses_updated_at BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
