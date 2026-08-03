-- Telephony plugin — VoIPcloud hosted PBX integration.
--
-- Their PBX pushes call events to a webhook; we log every call, match it to a
-- customer / contact / lead / prospect by caller ID, and can turn a missed call
-- or voicemail into a lead or task. Additive, plugin defaults OFF.
--
-- Multi-tenancy: a webhook arrives with no session, so the business is
-- identified by an unguessable token in the URL path (the same shape the
-- customer portal already uses), and the shared secret they configure is
-- verified from the X-Pbx-Token header.

-- ── Phone matching ──────────────────────────────────────────────────────────
-- Caller ID arrives as +61412345678, 0412345678, 61412345678 or "(02) 9876
-- 5432" depending on the carrier, while stored numbers are whatever the user
-- typed. Comparing the LAST 9 DIGITS collapses every one of those forms to the
-- same key (the AU national significant number), and unlike a LIKE '%...'
-- scan it's an equality match a btree index can serve.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','contacts','leads','prospects'] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS phone_digits TEXT
         GENERATED ALWAYS AS (right(regexp_replace(coalesce(phone,''''), ''\D'', '''', ''g''), 9)) STORED', t);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_phone_digits ON public.%I (business_id, phone_digits)
         WHERE phone_digits <> ''''', t, t);
  END LOOP;
END $$;

-- ── Per-business settings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.telephony_settings (
  business_id       UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  provider          TEXT NOT NULL DEFAULT 'voipcloud',
  -- Identifies the business in the webhook URL. Unguessable, rotatable.
  webhook_token     TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  -- The value they type into VoIPcloud's "Secret Token" field; arrives as
  -- X-Pbx-Token on every request.
  webhook_secret    TEXT,
  api_key_enc       TEXT,                       -- encrypted (src/lib/crypto.ts)
  api_base_url      TEXT,
  -- What to do automatically
  log_calls         BOOLEAN NOT NULL DEFAULT TRUE,
  create_lead_on_missed   BOOLEAN NOT NULL DEFAULT FALSE,
  create_task_on_missed   BOOLEAN NOT NULL DEFAULT TRUE,
  create_task_on_voicemail BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telephony_settings_token
  ON public.telephony_settings (webhook_token);

-- ── Call log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calls (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'voipcloud',
  -- The PBX's unique_call_id. One call fires several events (ringing →
  -- answered → completed), so this is what collapses them into one row.
  external_id   TEXT,
  direction     TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
  status        TEXT NOT NULL DEFAULT 'ringing'
                CHECK (status IN ('ringing','answered','completed','missed','voicemail','failed')),
  from_number   TEXT,
  to_number     TEXT,
  -- Normalised match key for whichever party is the outside line.
  counterparty_digits TEXT,
  caller_name   TEXT,
  user_name     TEXT,                            -- the extension/user involved
  user_number   TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at   TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  duration_seconds INT,
  recording_url TEXT,
  -- Whoever the caller ID resolved to (at most one is set).
  customer_id   UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  contact_id    UUID REFERENCES public.contacts(id)  ON DELETE SET NULL,
  lead_id       UUID REFERENCES public.leads(id)     ON DELETE SET NULL,
  prospect_id   UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
  -- What the automations produced, so we never double-create on a repeat event.
  created_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  notes         TEXT,
  raw           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per real-world call. Events arrive out of order and can be retried,
-- so the ingest upserts on this rather than trusting arrival order.
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_biz_external
  ON public.calls (business_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_biz_started ON public.calls (business_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_biz_customer ON public.calls (business_id, customer_id)
  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_biz_status ON public.calls (business_id, status);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.telephony_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Members can read; only owner/admin/editor can write. Workers are excluded —
-- call logs expose customer contact details they're not entitled to.
DROP POLICY IF EXISTS telephony_settings_read ON public.telephony_settings;
CREATE POLICY telephony_settings_read ON public.telephony_settings FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND status = 'active' AND role <> 'worker'
  )
);
DROP POLICY IF EXISTS telephony_settings_write ON public.telephony_settings;
CREATE POLICY telephony_settings_write ON public.telephony_settings FOR ALL USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin','editor')
  )
);

DROP POLICY IF EXISTS calls_read ON public.calls;
CREATE POLICY calls_read ON public.calls FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND status = 'active' AND role <> 'worker'
  )
);
DROP POLICY IF EXISTS calls_write ON public.calls;
CREATE POLICY calls_write ON public.calls FOR ALL USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin','editor')
  )
);
