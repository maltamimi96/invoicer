-- ============================================================================
-- Quoting Agent
--
-- A specialised AI agent that generates quotes from natural-language briefs
-- using a per-business knowledge bank — material costs, labour rates, margins,
-- scope templates, and free-form notes. The user can teach the agent during
-- onboarding (or let it estimate), and can override its memory any time.
--
-- Two tables:
--   • quoting_agent_settings — one row per business with the enable flag,
--     selected industries, baseline rates/margins/tax, and the user's chosen
--     mode (manual / ai-estimate / skip).
--   • quoting_agent_knowledge — the agent's long-term memory: prices, rates,
--     scope notes, etc. keyed by kind+key so the agent can look things up
--     ("1m copper pipe", "tile installer hourly", "deposit percentage").
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.quoting_agent_settings (
  business_id              UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  enabled                  BOOLEAN     NOT NULL DEFAULT FALSE,
  onboarded_at             TIMESTAMPTZ,
  industries               TEXT[]      NOT NULL DEFAULT '{}',
  default_hourly_rate      NUMERIC(12,2),
  default_margin_percent   NUMERIC(5,2),
  default_tax_rate         NUMERIC(5,2),
  call_out_fee             NUMERIC(12,2),
  emergency_rate_multiplier NUMERIC(5,2) DEFAULT 1.5,
  /** "manual" | "ai_estimate" | "skip" — how the user wants the agent to
      handle unknown items: ask, estimate from world knowledge, or leave
      blank for the user to fill. */
  estimation_mode          TEXT        NOT NULL DEFAULT 'ai_estimate'
                                       CHECK (estimation_mode IN ('manual', 'ai_estimate', 'skip')),
  /** Free-form notes the user wants the agent to always remember — house
      style, terms wording, preferred suppliers, anything contextual. */
  business_notes           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quoting_agent_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quoting_settings_all" ON public.quoting_agent_settings;
CREATE POLICY "quoting_settings_all" ON public.quoting_agent_settings
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members
       WHERE user_id = auth.uid() AND status = 'active'
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
  );

-- Auto-update updated_at
DROP TRIGGER IF EXISTS quoting_settings_updated_at ON public.quoting_agent_settings;
CREATE TRIGGER quoting_settings_updated_at
  BEFORE UPDATE ON public.quoting_agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Knowledge bank — long-term memory the agent reads from + writes to.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.quoting_agent_knowledge (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  /** What kind of fact this is, so the agent can filter its lookups. */
  kind          TEXT        NOT NULL
                            CHECK (kind IN ('material', 'labour', 'margin', 'scope_template', 'rate', 'note')),
  /** Human-readable key the agent will match on, e.g. "1m copper pipe",
      "tile installer hourly", "deposit percentage". Lowercased + trimmed
      by the action layer so lookups are case-insensitive. */
  key           TEXT        NOT NULL,
  /** The fact itself — usually a number as text ("145.00") or a free-form
      string ("we always invoice 30% deposit before commencing"). */
  value         TEXT        NOT NULL,
  /** Optional unit so the agent can format prices correctly. */
  unit          TEXT,
  /** Optional category — usually one of the business's selected industries. */
  category      TEXT,
  /** "user" | "ai_estimate" | "imported" — so the UI can flag estimates
      that haven't been confirmed yet. */
  source        TEXT        NOT NULL DEFAULT 'user'
                            CHECK (source IN ('user', 'ai_estimate', 'imported')),
  notes         TEXT,
  /** Whether the user has confirmed this fact (especially relevant for
      ai_estimate-sourced rows). */
  confirmed     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, kind, key)
);

CREATE INDEX IF NOT EXISTS idx_quoting_knowledge_business
  ON public.quoting_agent_knowledge (business_id, kind);
CREATE INDEX IF NOT EXISTS idx_quoting_knowledge_key
  ON public.quoting_agent_knowledge (business_id, lower(key));
CREATE INDEX IF NOT EXISTS idx_quoting_knowledge_category
  ON public.quoting_agent_knowledge (business_id, category)
  WHERE category IS NOT NULL;

ALTER TABLE public.quoting_agent_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quoting_knowledge_all" ON public.quoting_agent_knowledge;
CREATE POLICY "quoting_knowledge_all" ON public.quoting_agent_knowledge
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members
       WHERE user_id = auth.uid() AND status = 'active'
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
  );

DROP TRIGGER IF EXISTS quoting_knowledge_updated_at ON public.quoting_agent_knowledge;
CREATE TRIGGER quoting_knowledge_updated_at
  BEFORE UPDATE ON public.quoting_agent_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
