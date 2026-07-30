-- Payroll plugin (field-services). Employees + pay runs; gross from hours×rate
-- or salary, super as a %, manual tax; wages + super post to Expenses on
-- finalise so business spend / P&L include payroll. Additive. Default OFF.

-- ── employees ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_employees (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  member_profile_id UUID REFERENCES public.member_profiles(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  email             TEXT,
  pay_type          TEXT NOT NULL DEFAULT 'hourly' CHECK (pay_type IN ('hourly','salary')),
  hourly_rate       NUMERIC NOT NULL DEFAULT 0,
  annual_salary     NUMERIC NOT NULL DEFAULT 0,
  super_rate        NUMERIC NOT NULL DEFAULT 11.5,   -- % of gross
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_business ON public.payroll_employees (business_id);

-- ── pay runs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pay_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  pay_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalised')),
  notes             TEXT,
  gross_total       NUMERIC NOT NULL DEFAULT 0,
  super_total       NUMERIC NOT NULL DEFAULT 0,
  tax_total         NUMERIC NOT NULL DEFAULT 0,
  net_total         NUMERIC NOT NULL DEFAULT 0,
  wages_expense_id  UUID,
  super_expense_id  UUID,
  finalised_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pay_runs_business ON public.pay_runs (business_id, pay_date DESC);

-- ── pay run lines ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pay_run_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  pay_run_id    UUID NOT NULL REFERENCES public.pay_runs(id) ON DELETE CASCADE,
  employee_id   UUID REFERENCES public.payroll_employees(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  pay_type      TEXT NOT NULL DEFAULT 'hourly',
  hours         NUMERIC NOT NULL DEFAULT 0,
  rate          NUMERIC NOT NULL DEFAULT 0,
  gross         NUMERIC NOT NULL DEFAULT 0,
  super_amount  NUMERIC NOT NULL DEFAULT 0,
  tax_amount    NUMERIC NOT NULL DEFAULT 0,
  net           NUMERIC NOT NULL DEFAULT 0,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pay_run_lines_run ON public.pay_run_lines (pay_run_id);

-- ── RLS: read = non-worker business members; write = owner/admin/editor ───────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_employees','pay_runs','pay_run_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_read', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT USING (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
      ) AND NOT public.is_business_worker(business_id)
    );$f$, t||'_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_write', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL USING (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active' AND role IN ('admin','editor')
      )
    ) WITH CHECK (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active' AND role IN ('admin','editor')
      )
    );$f$, t||'_write', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS payroll_employees_updated_at ON public.payroll_employees;
CREATE TRIGGER payroll_employees_updated_at BEFORE UPDATE ON public.payroll_employees
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS pay_runs_updated_at ON public.pay_runs;
CREATE TRIGGER pay_runs_updated_at BEFORE UPDATE ON public.pay_runs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
