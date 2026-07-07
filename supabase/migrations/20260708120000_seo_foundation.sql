-- SEO Production engine — data model foundation (docs/SEO_AGENCY_PLAN.md, Phase 2.1).
--
-- The agency is the BUSINESS; each of their clients is a CUSTOMER, so every SEO
-- entity hangs off (business_id, customer_id/site). Additive only — new tables,
-- no changes to existing tables or data. Gated behind the "seo-production"
-- plugin (business_agent_installs, default off), so nothing appears for any
-- current business until they enable it or apply the seo-agency-local preset.
--
-- Connector tokens (seo_connections.secret) are stored encrypted by the
-- application layer (shared crypto helper, added with the connector work) — the
-- column is plain TEXT holding ciphertext, never plaintext.

-- ── Client sites ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seo_sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  domain      TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT 'other'  CHECK (platform IN ('wordpress','shopify','other')),
  playbook    TEXT NOT NULL DEFAULT 'local'  CHECK (playbook IN ('local','ecommerce')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seo_sites_business ON public.seo_sites (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_sites_customer ON public.seo_sites (customer_id);

-- ── Per-site connector auth (GSC / Shopify / WordPress / GBP) ─────────────────
CREATE TABLE IF NOT EXISTS public.seo_connections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  site_id     UUID NOT NULL REFERENCES public.seo_sites(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL CHECK (provider IN ('gsc','shopify','wordpress','gbp')),
  status      TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','disconnected','error')),
  account_ref TEXT,                                  -- external account/property id
  secret      TEXT,                                  -- AES-256-GCM ciphertext (refresh token etc.)
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_seo_connections_business ON public.seo_connections (business_id);
CREATE INDEX IF NOT EXISTS idx_seo_connections_site ON public.seo_connections (site_id);

-- ── Keyword time-series (nightly GSC pull) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seo_keyword_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  site_id     UUID NOT NULL REFERENCES public.seo_sites(id) ON DELETE CASCADE,
  keyword     TEXT NOT NULL,
  position    NUMERIC,
  clicks      INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr         NUMERIC,
  captured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seo_kw_snapshots_site ON public.seo_keyword_snapshots (site_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_kw_snapshots_keyword ON public.seo_keyword_snapshots (site_id, keyword, captured_at DESC);

-- ── Opportunity queue (the scout's output) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seo_opportunities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  site_id     UUID NOT NULL REFERENCES public.seo_sites(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                          -- e.g. content_gap, quick_win, technical
  title       TEXT NOT NULL,
  detail      TEXT,
  priority    INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','in_progress','done','dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seo_opportunities_site ON public.seo_opportunities (site_id, status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_seo_opportunities_business ON public.seo_opportunities (business_id, created_at DESC);

-- ── Content pipeline (brief → draft → approved → published) ──────────────────
CREATE TABLE IF NOT EXISTS public.seo_content_pieces (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  site_id        UUID NOT NULL REFERENCES public.seo_sites(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.seo_opportunities(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  target_keyword TEXT,
  status         TEXT NOT NULL DEFAULT 'brief' CHECK (status IN ('brief','draft','approved','published')),
  brief          JSONB NOT NULL DEFAULT '{}'::jsonb,
  html           TEXT,
  published_url  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seo_content_site ON public.seo_content_pieces (site_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_content_business ON public.seo_content_pieces (business_id, created_at DESC);

-- ── Job engine (Vercel-native, step-wise + checkpointed) ─────────────────────
CREATE TABLE IF NOT EXISTS public.seo_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  site_id     UUID REFERENCES public.seo_sites(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                          -- keyword_strategy, opportunity_scout, brief, draft, ...
  status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','awaiting_approval','done','failed')),
  step        INTEGER NOT NULL DEFAULT 0,
  checkpoint  JSONB NOT NULL DEFAULT '{}'::jsonb,
  input       JSONB NOT NULL DEFAULT '{}'::jsonb,
  output      JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_cents  INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Partial index on the runner's hot path: the next claimable job.
CREATE INDEX IF NOT EXISTS idx_seo_jobs_queued ON public.seo_jobs (created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_seo_jobs_business ON public.seo_jobs (business_id, created_at DESC);

-- ── Brand voice / tone per client (seeds agent copy) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.seo_brand_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  site_id     UUID REFERENCES public.seo_sites(id) ON DELETE CASCADE,
  voice       TEXT,
  tone        TEXT,
  audience    TEXT,
  notes       TEXT,
  profile     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seo_brand_profiles_business ON public.seo_brand_profiles (business_id);
CREATE INDEX IF NOT EXISTS idx_seo_brand_profiles_site ON public.seo_brand_profiles (site_id);

-- ── RLS — read: members except workers · write: owner / admin / editor ───────
-- (crons write via the service-role client, which bypasses RLS.)
ALTER TABLE public.seo_sites             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_connections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_keyword_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_opportunities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_content_pieces    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_jobs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_brand_profiles    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'seo_sites','seo_connections','seo_keyword_snapshots','seo_opportunities',
    'seo_content_pieces','seo_jobs','seo_brand_profiles'
  ] LOOP
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

-- ── updated_at triggers ──────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'seo_sites','seo_connections','seo_opportunities',
    'seo_content_pieces','seo_jobs','seo_brand_profiles'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_updated_at ON public.%1$s;
      CREATE TRIGGER %1$s_updated_at BEFORE UPDATE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();', t);
  END LOOP;
END $$;
