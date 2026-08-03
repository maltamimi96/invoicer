-- Outreach agent — multi-step cold-email sequences over the prospects list.
--
-- Ported from the standalone Crown Roofers email-agent (Node + state.json +
-- GitHub Actions) into a multi-tenant, fully-configurable Kirei plugin:
--   · state.json            → these tables, RLS-scoped per business
--   · hardcoded 0/3/7/14    → user-built sequences with per-step delays
--   · hardcoded templates   → editable per-business step copy
--   · stage + replied flag  → per-message delivery/open/click tracking
-- Additive. Plugin defaults OFF.

-- ── per-business settings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outreach_settings (
  business_id        UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  -- sending guardrails
  daily_send_cap     INT NOT NULL DEFAULT 50,
  send_window_start  TIME NOT NULL DEFAULT '08:00',
  send_window_end    TIME NOT NULL DEFAULT '17:00',
  send_days          INT[] NOT NULL DEFAULT '{1,2,3,4,5}',   -- 0=Sun … 6=Sat
  seconds_between_sends INT NOT NULL DEFAULT 2,
  timezone           TEXT NOT NULL DEFAULT 'Australia/Sydney',
  from_local_part    TEXT NOT NULL DEFAULT 'outreach',
  reply_to           TEXT,
  signature_html     TEXT,
  -- prospect sourcing (Google Places)
  sourcing_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  places_api_key_enc TEXT,                                    -- encrypted at rest
  sourcing_queries   TEXT[] NOT NULL DEFAULT '{}',
  sourcing_locations JSONB NOT NULL DEFAULT '[]'::jsonb,      -- [{label,lat,lng,radius_m}]
  sourcing_daily_quota INT NOT NULL DEFAULT 10,
  -- Website email-crawling. OFF by default and gated behind an explicit
  -- acknowledgement: the Australian Spam Act 2003 s.22 prohibits sending to
  -- address-harvested lists, so this can't be on without a deliberate opt-in.
  crawler_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  compliance_ack_at  TIMESTAMPTZ,
  compliance_ack_by  UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── sequences + steps ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outreach_sequences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  vertical    TEXT,                                            -- e.g. 'strata' (seed provenance)
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outreach_sequences_biz ON public.outreach_sequences (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.outreach_sequence_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES public.outreach_sequences(id) ON DELETE CASCADE,
  step_order  INT NOT NULL,                                    -- 1-based
  -- Days to wait AFTER the previous step before this one sends. Step 1 = 0.
  delay_days  INT NOT NULL DEFAULT 0,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,                                   -- merge fields {{first_name}} etc
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sequence_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_outreach_steps_seq ON public.outreach_sequence_steps (sequence_id, step_order);

-- ── campaigns (segment → sequence) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outreach_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sequence_id UUID REFERENCES public.outreach_sequences(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed')),
  -- Which prospects auto-enrol: {tags:[], status:[], sources:[]}
  filter      JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_enroll BOOLEAN NOT NULL DEFAULT TRUE,
  daily_cap   INT,                                             -- null = use settings cap
  started_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_biz ON public.outreach_campaigns (business_id, created_at DESC);

-- ── enrollments (one prospect's progress through one campaign) ──────────────
CREATE TABLE IF NOT EXISTS public.outreach_enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  campaign_id  UUID NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  prospect_id  UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  sequence_id  UUID REFERENCES public.outreach_sequences(id) ON DELETE SET NULL,
  current_step INT NOT NULL DEFAULT 0,                         -- 0 = nothing sent yet
  next_send_at TIMESTAMPTZ,                                    -- null when finished/stopped
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','completed','stopped','bounced','replied','unsubscribed')),
  stop_reason  TEXT,
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (campaign_id, prospect_id)
);
CREATE INDEX IF NOT EXISTS idx_outreach_enroll_due
  ON public.outreach_enrollments (business_id, status, next_send_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_outreach_enroll_prospect ON public.outreach_enrollments (prospect_id);

-- ── messages (the tracking spine — one row per email actually sent) ─────────
CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.outreach_enrollments(id) ON DELETE CASCADE,
  campaign_id   UUID REFERENCES public.outreach_campaigns(id) ON DELETE SET NULL,
  prospect_id   UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
  step_id       UUID REFERENCES public.outreach_sequence_steps(id) ON DELETE SET NULL,
  step_order    INT,
  recipient     TEXT NOT NULL,
  subject       TEXT,
  body_preview  TEXT,
  resend_id     TEXT,
  status        TEXT NOT NULL DEFAULT 'sent'
                CHECK (status IN ('sent','delivered','opened','clicked','bounced','complained','failed')),
  error         TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at  TIMESTAMPTZ,
  opened_at     TIMESTAMPTZ,
  clicked_at    TIMESTAMPTZ,
  bounced_at    TIMESTAMPTZ,
  replied_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outreach_msg_biz      ON public.outreach_messages (business_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_msg_campaign ON public.outreach_messages (campaign_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_msg_resend   ON public.outreach_messages (resend_id) WHERE resend_id IS NOT NULL;

-- ── RLS: non-worker members read; owner/admin/editor write ──────────────────
DO $$
DECLARE tname TEXT;
BEGIN
  FOREACH tname IN ARRAY ARRAY[
    'outreach_settings','outreach_sequences','outreach_sequence_steps',
    'outreach_campaigns','outreach_enrollments','outreach_messages'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tname);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tname||'_read', tname);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT USING (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION SELECT business_id FROM public.business_members
          WHERE user_id = auth.uid() AND status='active'
      ) AND NOT public.is_business_worker(business_id)
    );$f$, tname||'_read', tname);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tname||'_write', tname);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL USING (
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
    );$f$, tname||'_write', tname);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS outreach_settings_updated_at ON public.outreach_settings;
CREATE TRIGGER outreach_settings_updated_at BEFORE UPDATE ON public.outreach_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS outreach_sequences_updated_at ON public.outreach_sequences;
CREATE TRIGGER outreach_sequences_updated_at BEFORE UPDATE ON public.outreach_sequences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS outreach_steps_updated_at ON public.outreach_sequence_steps;
CREATE TRIGGER outreach_steps_updated_at BEFORE UPDATE ON public.outreach_sequence_steps
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS outreach_campaigns_updated_at ON public.outreach_campaigns;
CREATE TRIGGER outreach_campaigns_updated_at BEFORE UPDATE ON public.outreach_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Let outreach emails ride the existing email_events tracking spine.
ALTER TABLE public.email_events DROP CONSTRAINT IF EXISTS email_events_doc_type_check;
ALTER TABLE public.email_events ADD CONSTRAINT email_events_doc_type_check
  CHECK (doc_type IN ('invoice','quote','team_invite','lead','custom','outreach'));
