-- Opt-in: when a linked worker has an UNTIMED (all-day) scheduled job, block
-- that whole local day from booking. Default false (untimed jobs ignored, as
-- fixed in the previous migration). Business-level toggle on booking_settings.
ALTER TABLE public.booking_settings
  ADD COLUMN IF NOT EXISTS block_untimed_jobs BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.booking_busy_intervals(
  p_business_id UUID,
  p_resource_id UUID,
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE (starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, kind TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- existing appointments
  SELECT a.starts_at, a.ends_at, 'appointment'::TEXT
    FROM public.appointments a
   WHERE a.business_id = p_business_id AND a.resource_id = p_resource_id
     AND a.status NOT IN ('cancelled', 'rescheduled')
     AND a.starts_at < p_to AND a.ends_at > p_from
  UNION ALL
  -- live holds
  SELECT h.starts_at, h.ends_at, 'hold'::TEXT
    FROM public.booking_holds h
   WHERE h.business_id = p_business_id AND h.resource_id = p_resource_id
     AND h.expires_at > NOW() AND h.starts_at < p_to AND h.ends_at > p_from
  UNION ALL
  -- linked worker's TIMED jobs — block their exact window
  SELECT
    (wo.scheduled_date + wo.start_time) AT TIME ZONE COALESCE(bs.timezone, 'UTC'),
    (wo.scheduled_date + wo.end_time)   AT TIME ZONE COALESCE(bs.timezone, 'UTC'),
    'job'::TEXT
    FROM public.work_orders wo
    JOIN public.booking_resources r ON r.id = p_resource_id
    LEFT JOIN public.booking_settings bs ON bs.business_id = p_business_id
   WHERE wo.business_id = p_business_id
     AND wo.scheduled_date IS NOT NULL AND wo.start_time IS NOT NULL AND wo.end_time IS NOT NULL
     AND wo.status NOT IN ('cancelled')
     AND r.member_profile_id IS NOT NULL AND wo.assigned_to_profile_id = r.member_profile_id
     AND (wo.scheduled_date + wo.end_time)   AT TIME ZONE COALESCE(bs.timezone, 'UTC') > p_from
     AND (wo.scheduled_date + wo.start_time) AT TIME ZONE COALESCE(bs.timezone, 'UTC') < p_to
  UNION ALL
  -- linked worker's UNTIMED jobs — block the whole local day (opt-in)
  SELECT
    (wo.scheduled_date::timestamp)         AT TIME ZONE COALESCE(bs.timezone, 'UTC'),
    ((wo.scheduled_date + 1)::timestamp)    AT TIME ZONE COALESCE(bs.timezone, 'UTC'),
    'job_allday'::TEXT
    FROM public.work_orders wo
    JOIN public.booking_resources r ON r.id = p_resource_id
    LEFT JOIN public.booking_settings bs ON bs.business_id = p_business_id
   WHERE wo.business_id = p_business_id
     AND wo.scheduled_date IS NOT NULL AND (wo.start_time IS NULL OR wo.end_time IS NULL)
     AND COALESCE(bs.block_untimed_jobs, FALSE) = TRUE
     AND wo.status NOT IN ('cancelled')
     AND r.member_profile_id IS NOT NULL AND wo.assigned_to_profile_id = r.member_profile_id
     AND wo.scheduled_date >= (p_from AT TIME ZONE COALESCE(bs.timezone, 'UTC'))::date - 1
     AND wo.scheduled_date <= (p_to   AT TIME ZONE COALESCE(bs.timezone, 'UTC'))::date + 1;
$$;
REVOKE ALL ON FUNCTION public.booking_busy_intervals(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
