-- ============================================================================
-- Online Booking / Appointments  (Phase 1 — database foundation)
--
-- A self-serve, multi-tenant booking system. A business configures bookable
-- services (appointment_types), who/what gets booked (booking_resources),
-- recurring availability (booking_working_hours) and exceptions
-- (booking_availability_exceptions). Customers book through public,
-- slug-scoped endpoints which create rows in `appointments`.
--
-- HARD GUARANTEE — double-booking is impossible at the DATABASE level via a
-- GiST exclusion constraint on (business_id, resource_id, time-range). Two
-- concurrent inserts for the same resource + overlapping window → exactly one
-- commits, the other raises 23P01 (exclusion_violation). App-level checks are
-- NOT relied upon.
--
-- Every table carries business_id and is guarded by RLS (membership-scoped,
-- worker-isolated). Public access never touches these tables directly — it
-- goes through SECURITY DEFINER functions / the service-role API layer that
-- always filters by slug → business_id.
-- ============================================================================

-- btree_gist lets us combine equality (uuid =) with range overlap (&&) inside
-- one GiST exclusion constraint. Required for the no-overlap guard below.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.appointment_status AS ENUM
    ('pending', 'confirmed', 'cancelled', 'rescheduled', 'completed', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_source AS ENUM ('web', 'embed', 'api', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- Shared RLS helper expressions (mirrors the quoting_agent / settings pattern)
--   READ : any active member of the business, EXCEPT hard-isolated workers
--          (appointments hold customer PII — workers must not see them).
--   WRITE: owner / admin / editor only.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- 1. booking_settings — one row per business (the public booking-page config)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.booking_settings (
  business_id              UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  enabled                  BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Public handle for the hosted page + API, e.g. kireihq.com/book/<slug>.
  slug                     TEXT        UNIQUE,
  -- IANA timezone the business operates in. All slot math renders in this tz.
  timezone                 TEXT        NOT NULL DEFAULT 'Australia/Sydney',
  -- Booking window / cadence controls.
  min_lead_minutes         INTEGER     NOT NULL DEFAULT 120,   -- can't book within N mins of now
  max_advance_days         INTEGER     NOT NULL DEFAULT 30,    -- horizon
  slot_granularity_minutes INTEGER     NOT NULL DEFAULT 15,
  default_buffer_minutes   INTEGER     NOT NULL DEFAULT 0,     -- travel/cleanup between appts
  max_per_day              INTEGER,                            -- null = unlimited
  -- Required customer fields.
  require_phone            BOOLEAN     NOT NULL DEFAULT TRUE,
  require_email            BOOLEAN     NOT NULL DEFAULT TRUE,
  require_address          BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Copy.
  confirmation_message     TEXT,
  cancellation_window_hours INTEGER    NOT NULL DEFAULT 24,
  -- Minutes-before-start to fire reminders, e.g. {1440, 120}.
  reminder_offsets         INTEGER[]   NOT NULL DEFAULT '{1440,120}',
  -- Side-effects per booking.
  create_lead              BOOLEAN     NOT NULL DEFAULT TRUE,
  create_work_order        BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Branding (null = inherit businesses.* ).
  brand_logo_url           TEXT,
  brand_color              TEXT,
  -- Bot protection — per-business keys so each tenant can BYO Turnstile/hCaptcha.
  captcha_provider         TEXT        CHECK (captcha_provider IN ('turnstile', 'hcaptcha') OR captcha_provider IS NULL),
  captcha_site_key         TEXT,
  captcha_secret_key       TEXT,
  -- Outbound webhook (reuses business_webhooks dispatcher if null).
  webhook_url              TEXT,
  webhook_secret           TEXT,
  -- Notification toggles.
  notify_customer_email    BOOLEAN     NOT NULL DEFAULT TRUE,
  notify_customer_sms      BOOLEAN     NOT NULL DEFAULT FALSE,
  notify_team_email        BOOLEAN     NOT NULL DEFAULT TRUE,
  team_notify_email        TEXT,                               -- null = business email
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Slug must be url-safe lowercase: letters, numbers, hyphen, 3-40 chars.
  CONSTRAINT booking_slug_format CHECK (slug IS NULL OR slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  CONSTRAINT booking_granularity_positive CHECK (slot_granularity_minutes > 0),
  CONSTRAINT booking_advance_positive CHECK (max_advance_days > 0)
);

CREATE INDEX IF NOT EXISTS idx_booking_settings_slug
  ON public.booking_settings (slug) WHERE slug IS NOT NULL AND enabled = TRUE;

-- ============================================================================
-- 2. appointment_types — bookable services
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.appointment_types (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  description         TEXT,
  duration_minutes    INTEGER     NOT NULL CHECK (duration_minutes > 0),
  buffer_minutes      INTEGER     CHECK (buffer_minutes IS NULL OR buffer_minutes >= 0), -- overrides settings.default_buffer_minutes
  price_display       TEXT,                                    -- free text, e.g. "Free", "From $120"
  color               TEXT,
  active              BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Which resources can serve this type. Empty = any active resource.
  eligible_resource_ids UUID[]    NOT NULL DEFAULT '{}',
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_types_business
  ON public.appointment_types (business_id, active, sort_order);

-- ============================================================================
-- 3. booking_resources — who/what gets booked (usually a team member)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.booking_resources (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- Optional link to a member_profiles row so we can subtract that worker's jobs.
  member_profile_id UUID       REFERENCES public.member_profiles(id) ON DELETE SET NULL,
  -- Public-safe label (e.g. first name only). Never expose member PII beyond this.
  display_name     TEXT        NOT NULL,
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_resources_business
  ON public.booking_resources (business_id, active);

-- ============================================================================
-- 4. booking_working_hours — recurring weekly availability per resource
--    weekday: 0=Sunday … 6=Saturday (matches JS Date.getDay()).
--    Multiple rows per (resource, weekday) allowed for split shifts.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.booking_working_hours (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  resource_id  UUID        NOT NULL REFERENCES public.booking_resources(id) ON DELETE CASCADE,
  weekday      SMALLINT    NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time   TIME        NOT NULL,
  end_time     TIME        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT working_hours_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_working_hours_resource
  ON public.booking_working_hours (resource_id, weekday);

-- ============================================================================
-- 5. booking_availability_exceptions — blackouts / holidays / extra hours
--    resource_id NULL = applies to the whole business.
--    is_closed TRUE = closed all day; otherwise custom start/end window.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.booking_availability_exceptions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  resource_id  UUID        REFERENCES public.booking_resources(id) ON DELETE CASCADE,
  date         DATE        NOT NULL,
  is_closed    BOOLEAN     NOT NULL DEFAULT TRUE,
  start_time   TIME,
  end_time     TIME,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exception_window CHECK (
    is_closed OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX IF NOT EXISTS idx_avail_exceptions
  ON public.booking_availability_exceptions (business_id, date);

-- ============================================================================
-- 6. appointments — the booked slots. resource_id NOT NULL so the overlap
--    guard always applies. starts_at/ends_at are UTC timestamptz.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.appointments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  appointment_type_id UUID        REFERENCES public.appointment_types(id) ON DELETE SET NULL,
  resource_id         UUID        NOT NULL REFERENCES public.booking_resources(id) ON DELETE CASCADE,
  -- Customer details (denormalised — customers book before they're a CRM row).
  customer_name       TEXT        NOT NULL,
  customer_phone      TEXT,
  customer_email      TEXT,
  customer_address    TEXT,
  notes               TEXT,
  starts_at           TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ NOT NULL,
  status              public.appointment_status NOT NULL DEFAULT 'confirmed',
  source              public.booking_source     NOT NULL DEFAULT 'web',
  -- Opaque token for customer self-serve reschedule/cancel (no login).
  manage_token        TEXT        NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  -- Optional links into the CRM created per booking_settings.
  lead_id             UUID        REFERENCES public.leads(id) ON DELETE SET NULL,
  work_order_id       UUID        REFERENCES public.work_orders(id) ON DELETE SET NULL,
  -- Idempotency: dedupe double-submits from the public POST.
  idempotency_key     TEXT,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointment_time_order CHECK (ends_at > starts_at),
  -- 🔒 THE GUARANTEE: no two non-cancelled appointments for the same resource
  -- may overlap. Half-open range [start, end) so back-to-back slots are OK.
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    business_id WITH =,
    resource_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status NOT IN ('cancelled', 'rescheduled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_idempotency
  ON public.appointments (business_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_manage_token
  ON public.appointments (manage_token);
CREATE INDEX IF NOT EXISTS idx_appointments_business_time
  ON public.appointments (business_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_resource_time
  ON public.appointments (resource_id, starts_at)
  WHERE status NOT IN ('cancelled', 'rescheduled');

-- ============================================================================
-- 7. booking_holds — short-lived soft reservation during checkout.
--    Counts as "busy" in the availability engine; auto-expires; cron cleans up.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.booking_holds (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  resource_id   UUID        NOT NULL REFERENCES public.booking_resources(id) ON DELETE CASCADE,
  appointment_type_id UUID  REFERENCES public.appointment_types(id) ON DELETE CASCADE,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  hold_token    TEXT        NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hold_time_order CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_holds_token ON public.booking_holds (hold_token);
CREATE INDEX IF NOT EXISTS idx_booking_holds_live
  ON public.booking_holds (resource_id, starts_at, expires_at);

-- ============================================================================
-- 8. booking_audit_log — lifecycle audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.booking_audit_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  appointment_id UUID        REFERENCES public.appointments(id) ON DELETE SET NULL,
  event          TEXT        NOT NULL,  -- created|confirmed|rescheduled|cancelled|no_show|reminder_sent|...
  actor          TEXT        NOT NULL DEFAULT 'system', -- 'customer' | 'system' | user uuid
  detail         JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_audit_appt
  ON public.booking_audit_log (appointment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_booking_audit_business
  ON public.booking_audit_log (business_id, created_at DESC);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'booking_settings', 'appointment_types', 'booking_resources', 'appointments'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- RLS — membership-scoped, worker-isolated. Public access bypasses these via
-- SECURITY DEFINER functions / the service-role API layer.
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'booking_settings', 'appointment_types', 'booking_resources',
    'booking_working_hours', 'booking_availability_exceptions',
    'appointments', 'booking_holds', 'booking_audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_member_read ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_member_write ON public.%I', t, t);

    -- READ: any active member, except hard-isolated workers.
    EXECUTE format($f$
      CREATE POLICY %I_member_read ON public.%I
        FOR SELECT USING (
          business_id IN (
            SELECT id FROM public.businesses WHERE user_id = auth.uid()
            UNION
            SELECT business_id FROM public.business_members
             WHERE user_id = auth.uid() AND status = 'active'
          )
          AND NOT public.is_business_worker(business_id)
        )
    $f$, t, t);

    -- WRITE (insert/update/delete): owner / admin / editor only.
    EXECUTE format($f$
      CREATE POLICY %I_member_write ON public.%I
        FOR ALL USING (
          business_id IN (
            SELECT id FROM public.businesses WHERE user_id = auth.uid()
            UNION
            SELECT business_id FROM public.business_members
             WHERE user_id = auth.uid() AND status = 'active'
               AND role IN ('admin', 'editor')
          )
        )
        WITH CHECK (
          business_id IN (
            SELECT id FROM public.businesses WHERE user_id = auth.uid()
            UNION
            SELECT business_id FROM public.business_members
             WHERE user_id = auth.uid() AND status = 'active'
               AND role IN ('admin', 'editor')
          )
        )
    $f$, t, t);
  END LOOP;
END $$;

-- ============================================================================
-- SECURITY DEFINER public helpers — the ONLY way unauthenticated traffic
-- touches booking data. Each resolves a single tenant by slug and never
-- leaks cross-tenant rows or resource PII.
-- ============================================================================

-- Resolve an ENABLED booking slug to its business_id (or NULL). Used by every
-- public endpoint as the tenant gate.
CREATE OR REPLACE FUNCTION public.booking_business_for_slug(p_slug TEXT)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM public.booking_settings
   WHERE slug = lower(p_slug) AND enabled = TRUE
   LIMIT 1;
$$;

-- Busy intervals for a resource in a window: confirmed/pending appointments,
-- live holds, AND the resource's existing KireiHQ scheduled jobs (work_orders).
-- Times returned in UTC. The availability service subtracts these (+ buffers).
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
   WHERE a.business_id = p_business_id
     AND a.resource_id = p_resource_id
     AND a.status NOT IN ('cancelled', 'rescheduled')
     AND a.starts_at < p_to AND a.ends_at > p_from
  UNION ALL
  -- live holds
  SELECT h.starts_at, h.ends_at, 'hold'::TEXT
    FROM public.booking_holds h
   WHERE h.business_id = p_business_id
     AND h.resource_id = p_resource_id
     AND h.expires_at > NOW()
     AND h.starts_at < p_to AND h.ends_at > p_from
  UNION ALL
  -- existing scheduled jobs for the team member behind this resource
  SELECT
    (wo.scheduled_date + COALESCE(wo.start_time, '00:00'::time)) AT TIME ZONE COALESCE(bs.timezone, 'UTC'),
    (wo.scheduled_date + COALESCE(wo.end_time, '23:59'::time))   AT TIME ZONE COALESCE(bs.timezone, 'UTC'),
    'job'::TEXT
    FROM public.work_orders wo
    JOIN public.booking_resources r ON r.id = p_resource_id
    LEFT JOIN public.booking_settings bs ON bs.business_id = p_business_id
   WHERE wo.business_id = p_business_id
     AND wo.scheduled_date IS NOT NULL
     AND wo.status NOT IN ('cancelled')
     AND r.member_profile_id IS NOT NULL
     AND wo.assigned_to_profile_id = r.member_profile_id;
$$;

-- Atomically expire stale holds. Called by the booking cron.
CREATE OR REPLACE FUNCTION public.booking_expire_holds()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  WITH del AS (
    DELETE FROM public.booking_holds WHERE expires_at <= NOW() RETURNING 1
  )
  SELECT count(*) INTO n FROM del;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.booking_business_for_slug(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_busy_intervals(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_expire_holds() FROM PUBLIC;
