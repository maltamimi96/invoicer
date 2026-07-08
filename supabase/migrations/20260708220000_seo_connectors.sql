-- SEO publishing gateways (docs/SEO_AGENCY_PLAN.md, Phase 2) — open up
-- seo_connections to arbitrary connector types (git, wordpress, sanity,
-- payload, rest, graphql, …). Provider is now validated in code by the
-- connector registry rather than a DB CHECK, and a site can have more than one
-- connection (e.g. two REST endpoints). Config lives in meta jsonb; the token/
-- key lives in `secret` (AES-256-GCM ciphertext). Additive/relaxing only.
ALTER TABLE public.seo_connections DROP CONSTRAINT IF EXISTS seo_connections_provider_check;
ALTER TABLE public.seo_connections DROP CONSTRAINT IF EXISTS seo_connections_site_id_provider_key;
ALTER TABLE public.seo_connections ADD COLUMN IF NOT EXISTS label TEXT;
