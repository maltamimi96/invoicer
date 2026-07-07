-- SEO per-business monthly budget cap (docs/SEO_AGENCY_PLAN.md §11 — non-negotiable).
-- Additive: a monthly ceiling (cents) the job engine enforces before each agent
-- step. Default $20/mo; 0 = unlimited (explicit opt-out). Existing businesses
-- get the default and are unaffected until they enable the SEO plugin.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS seo_monthly_budget_cents INTEGER NOT NULL DEFAULT 2000;
