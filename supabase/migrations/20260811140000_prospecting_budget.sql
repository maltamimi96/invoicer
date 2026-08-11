-- Metering for the prospecting agent, so a platform-owned Places key is safe.
--
-- Kirei can now supply the Google Places key itself (GOOGLE_PLACES_API_KEY)
-- instead of every business having to stand up a Google Cloud project — which
-- nobody was ever going to do. That only works with a meter: a shared key with
-- no cap means one business's re-runs bill the platform with nothing stopping
-- them, and hunts are re-runnable by design.
--
-- Mirrors seo_monthly_budget_cents exactly (same default semantics, same
-- 0 = unlimited opt-out) so there is one budget idea in the app, not two.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS prospecting_monthly_budget_cents INTEGER NOT NULL DEFAULT 500;

COMMENT ON COLUMN public.businesses.prospecting_monthly_budget_cents IS
  'Monthly ceiling (cents) for prospecting hunts — Places requests + verify calls. 0 = unlimited.';

-- Split the run cost so the two very different spends stay legible: Places is
-- billed per request by field mask, the verifier is billed per token. When a
-- month gets expensive you need to know WHICH half did it — searching too
-- broadly and judging too many are different fixes.
ALTER TABLE public.prospect_hunt_runs
  ADD COLUMN IF NOT EXISTS places_requests   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS places_cost_cents NUMERIC(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_cost_cents  NUMERIC(10,3) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.prospect_hunt_runs.cost_cents IS
  'Total for the run: places_cost_cents + model_cost_cents. What the budget meters.';

-- The budget reads month-to-date spend across every run for the business.
CREATE INDEX IF NOT EXISTS idx_prospect_hunt_runs_spend
  ON public.prospect_hunt_runs (business_id, started_at DESC);
