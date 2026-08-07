-- Automations: when X happens, do Y.
--
-- Two tables. `automations` is the rule a business writes. `automation_runs`
-- is one queued execution of it, modelled on scheduled_sends (claim-lock +
-- attempt count) and seo_jobs (status machine), because both already work
-- under serverless and neither needed inventing.
--
-- Why a run row per event rather than acting inline: the trigger fires inside
-- a user's request, and an automation may send email, wait, or fail. Queuing
-- keeps the user's action fast and makes a failure visible and retryable
-- instead of a swallowed exception.
--
-- run_at exists from the start even though v1 has no waits — it's what lets
-- "wait 3 days, then chase" arrive later without a migration.

CREATE TABLE IF NOT EXISTS public.automations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  -- What starts it, e.g. 'customer.created'. Free text rather than an enum:
  -- adding a trigger shouldn't need a migration, and the runner ignores
  -- events it has no rule for.
  trigger_event TEXT NOT NULL,
  -- Optional narrowing, e.g. [{field:"account_type",op:"eq",value:"retainer_client"}]
  conditions    JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Ordered steps, e.g. [{type:"send_onboarding_form",form_id:"..."}]
  actions       JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_run_at   TIMESTAMPTZ,
  run_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_business ON public.automations (business_id, created_at DESC);
-- The runner's hot path: find enabled rules for this business + event.
CREATE INDEX IF NOT EXISTS idx_automations_trigger
  ON public.automations (business_id, trigger_event) WHERE enabled;

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  automation_id  UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  -- The fact, not a payload: webhook payloads are inconsistent across the app
  -- and some carry no customer at all. The runner re-hydrates from these.
  trigger_event  TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      UUID NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','running','done','failed','skipped')),
  run_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count  INTEGER NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  -- What happened, per action, so a failure is readable in the UI rather than
  -- only in a server log nobody opens.
  result         JSONB NOT NULL DEFAULT '[]'::jsonb,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The claim query: due, pending, oldest first. Partial so it stays small
-- however much history accumulates.
CREATE INDEX IF NOT EXISTS idx_automation_runs_due
  ON public.automation_runs (run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_automation_runs_business
  ON public.automation_runs (business_id, created_at DESC);

-- One run per (automation, entity, event). An automation that fires twice for
-- the same customer because a page was saved twice would email them twice —
-- the database refuses rather than trusting the caller to dedupe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_runs_once
  ON public.automation_runs (automation_id, entity_id, trigger_event);

ALTER TABLE public.automations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

-- Read: any active member except workers. Write: owner / admin / editor.
-- Copied from recurring_invoices, NOT from business_webhooks — that one has
-- RLS enabled with zero policies, which denies everything.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['automations','automation_runs'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS %1$s_read ON public.%1$s;
      CREATE POLICY %1$s_read ON public.%1$s FOR SELECT USING (
        business_id IN (
          SELECT id FROM public.businesses WHERE user_id = auth.uid()
          UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
        ) AND NOT public.is_business_worker(business_id)
      );
      DROP POLICY IF EXISTS %1$s_write ON public.%1$s;
      CREATE POLICY %1$s_write ON public.%1$s FOR ALL USING (
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
    $f$, t);
  END LOOP;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['automations','automation_runs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_updated_at ON public.%1$s;
      CREATE TRIGGER %1$s_updated_at BEFORE UPDATE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();', t);
  END LOOP;
END $$;

-- Per-business on/off, matching how every other plugin stores its flag.
CREATE TABLE IF NOT EXISTS public.automations_settings (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.automations_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automations_settings_read ON public.automations_settings;
CREATE POLICY automations_settings_read ON public.automations_settings FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ) AND NOT public.is_business_worker(business_id)
);
DROP POLICY IF EXISTS automations_settings_write ON public.automations_settings;
CREATE POLICY automations_settings_write ON public.automations_settings FOR ALL USING (
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
DROP TRIGGER IF EXISTS automations_settings_updated_at ON public.automations_settings;
CREATE TRIGGER automations_settings_updated_at BEFORE UPDATE ON public.automations_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
