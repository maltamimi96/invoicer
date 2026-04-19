-- Recurring jobs: schedules that auto-generate work orders on a cadence
CREATE TABLE IF NOT EXISTS public.recurring_jobs (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id                 uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id                     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                        text        NOT NULL,
  title                       text        NOT NULL,
  description                 text,
  customer_id                 uuid        REFERENCES public.customers(id) ON DELETE SET NULL,
  site_id                     uuid        REFERENCES public.sites(id) ON DELETE SET NULL,
  property_address            text,
  reported_issue              text,
  member_profile_ids          uuid[]      NOT NULL DEFAULT '{}',
  cadence                     text        NOT NULL CHECK (cadence IN ('weekly', 'fortnightly', 'monthly', 'quarterly')),
  preferred_weekday           int         CHECK (preferred_weekday BETWEEN 0 AND 6),
  preferred_day_of_month      int         CHECK (preferred_day_of_month BETWEEN 1 AND 28),
  preferred_start_time        text,
  preferred_duration_minutes  int,
  generate_days_ahead         int         NOT NULL DEFAULT 14,
  next_occurrence_at          date        NOT NULL,
  last_generated_at           timestamptz,
  active                      boolean     NOT NULL DEFAULT true,
  ends_on                     date,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recurring_jobs_business_idx ON public.recurring_jobs (business_id);
CREATE INDEX IF NOT EXISTS recurring_jobs_next_idx ON public.recurring_jobs (next_occurrence_at) WHERE active = true;

ALTER TABLE public.recurring_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_jobs_business_access" ON public.recurring_jobs
  FOR ALL USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members
        WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Link generated work orders back to their schedule
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS recurring_job_id uuid REFERENCES public.recurring_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS work_orders_recurring_job_idx ON public.work_orders (recurring_job_id);
