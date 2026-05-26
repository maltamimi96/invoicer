-- ============================================================================
-- Multiple booking forms.
--
-- A business can now publish several booking forms — each with its own slug,
-- name, rules, branding, and a chosen subset of the shared services
-- (appointment_types) and resources. Services/resources/working-hours stay at
-- the business level (one shared library); a form just exposes a selection.
--
-- The existing single booking_settings row is migrated into a "Default" form
-- so nothing breaks. booking_settings is retained as the business-level record
-- (timezone source for booking_busy_intervals, "booking enabled at all" flag).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.booking_forms (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id              UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL DEFAULT 'Booking',
  slug                     TEXT UNIQUE,
  enabled                  BOOLEAN NOT NULL DEFAULT FALSE,
  timezone                 TEXT NOT NULL DEFAULT 'Australia/Sydney',
  min_lead_minutes         INTEGER NOT NULL DEFAULT 120,
  max_advance_days         INTEGER NOT NULL DEFAULT 30,
  slot_granularity_minutes INTEGER NOT NULL DEFAULT 15,
  default_buffer_minutes   INTEGER NOT NULL DEFAULT 0,
  max_per_day              INTEGER,
  require_phone            BOOLEAN NOT NULL DEFAULT TRUE,
  require_email            BOOLEAN NOT NULL DEFAULT TRUE,
  require_address          BOOLEAN NOT NULL DEFAULT FALSE,
  show_resource_names      BOOLEAN NOT NULL DEFAULT TRUE,
  confirmation_message     TEXT,
  cancellation_window_hours INTEGER NOT NULL DEFAULT 24,
  reminder_offsets         INTEGER[] NOT NULL DEFAULT '{1440,120}',
  create_lead              BOOLEAN NOT NULL DEFAULT TRUE,
  create_work_order        BOOLEAN NOT NULL DEFAULT FALSE,
  brand_logo_url           TEXT,
  brand_color              TEXT,
  captcha_provider         TEXT CHECK (captcha_provider IN ('turnstile','hcaptcha') OR captcha_provider IS NULL),
  captcha_site_key         TEXT,
  captcha_secret_key       TEXT,
  webhook_url              TEXT,
  webhook_secret           TEXT,
  notify_customer_email    BOOLEAN NOT NULL DEFAULT TRUE,
  notify_customer_sms      BOOLEAN NOT NULL DEFAULT FALSE,
  notify_team_email        BOOLEAN NOT NULL DEFAULT TRUE,
  team_notify_email        TEXT,
  -- Empty array = expose ALL active services / resources.
  appointment_type_ids     UUID[] NOT NULL DEFAULT '{}',
  resource_ids             UUID[] NOT NULL DEFAULT '{}',
  sort_order               INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_form_slug_format CHECK (slug IS NULL OR slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$')
);

CREATE INDEX IF NOT EXISTS idx_booking_forms_business ON public.booking_forms (business_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_booking_forms_slug ON public.booking_forms (slug) WHERE slug IS NOT NULL AND enabled = TRUE;

ALTER TABLE public.booking_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_forms_read ON public.booking_forms;
DROP POLICY IF EXISTS booking_forms_write ON public.booking_forms;
CREATE POLICY booking_forms_read ON public.booking_forms FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);
CREATE POLICY booking_forms_write ON public.booking_forms FOR ALL USING (
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

DROP TRIGGER IF EXISTS booking_forms_updated_at ON public.booking_forms;
CREATE TRIGGER booking_forms_updated_at BEFORE UPDATE ON public.booking_forms
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Appointments belong to a form (nullable for legacy rows).
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS form_id UUID REFERENCES public.booking_forms(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- Migrate each existing booking_settings row into a "Default" form, taking
-- over its slug. (Clear the slug on booking_settings so the unique handle now
-- lives on the form.)
-- ----------------------------------------------------------------------------
INSERT INTO public.booking_forms (
  business_id, name, slug, enabled, timezone, min_lead_minutes, max_advance_days,
  slot_granularity_minutes, default_buffer_minutes, max_per_day, require_phone,
  require_email, require_address, show_resource_names, confirmation_message,
  cancellation_window_hours, reminder_offsets, create_lead, create_work_order,
  brand_logo_url, brand_color, captcha_provider, captcha_site_key, captcha_secret_key,
  webhook_url, webhook_secret, notify_customer_email, notify_customer_sms,
  notify_team_email, team_notify_email
)
SELECT
  bs.business_id, 'Default booking', bs.slug, bs.enabled, bs.timezone, bs.min_lead_minutes,
  bs.max_advance_days, bs.slot_granularity_minutes, bs.default_buffer_minutes, bs.max_per_day,
  bs.require_phone, bs.require_email, bs.require_address, bs.show_resource_names,
  bs.confirmation_message, bs.cancellation_window_hours, bs.reminder_offsets, bs.create_lead,
  bs.create_work_order, bs.brand_logo_url, bs.brand_color, bs.captcha_provider, bs.captcha_site_key,
  bs.captcha_secret_key, bs.webhook_url, bs.webhook_secret, bs.notify_customer_email,
  bs.notify_customer_sms, bs.notify_team_email, bs.team_notify_email
FROM public.booking_settings bs
WHERE NOT EXISTS (SELECT 1 FROM public.booking_forms f WHERE f.business_id = bs.business_id);

-- Point existing appointments at their business's (single) migrated form.
UPDATE public.appointments a
   SET form_id = f.id
  FROM public.booking_forms f
 WHERE f.business_id = a.business_id AND a.form_id IS NULL;

-- Free the slug on booking_settings (now owned by the form).
UPDATE public.booking_settings SET slug = NULL WHERE slug IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Public slug resolver now reads booking_forms.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_business_for_slug(p_slug TEXT)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM public.booking_forms
   WHERE slug = lower(p_slug) AND enabled = TRUE
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.booking_business_for_slug(TEXT) FROM PUBLIC;
