-- Timesheets & payroll plugin (field-services). Rolls up job_time_entries per
-- worker per week; hourly_rate on the member profile drives pay. Additive.
ALTER TABLE public.member_profiles ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC;
