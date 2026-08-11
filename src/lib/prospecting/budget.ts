/**
 * The meter that makes a platform-owned Places key safe.
 *
 * Kirei can supply the Google Places key itself, because asking a sole-trader
 * to stand up a Google Cloud project with billing is a wall in front of the
 * feature — nobody ever did it. But a shared key with no ceiling means one
 * business's re-runs bill the platform, and hunts are re-runnable by design.
 * So: every run is priced, month-to-date spend is checked before anything is
 * spent, and the gate is re-checked mid-run.
 *
 * Same shape as `seoSpendStatus` — one budget idea in the app, not two.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

/**
 * Cents per Places request.
 *
 * Places bills per request, tiered by which fields you ask for: Essentials
 * (ids only), Pro, Enterprise. Our field mask asks for phone, website and
 * rating — that's what makes "no website" a fact instead of a guess, and it's
 * also what puts every request in a paid tier. Google's rate card moves, so
 * this is an env knob rather than a constant to be edited in a release:
 *
 *   GOOGLE_PLACES_CENTS_PER_REQUEST=3.5
 *
 * The default is a deliberate over-estimate. A meter that under-charges lets
 * real spend past the cap, which is the only failure mode that costs money.
 */
export const PLACES_CENTS_PER_REQUEST =
  Number(process.env.GOOGLE_PLACES_CENTS_PER_REQUEST) || 3.5;

export const DEFAULT_PROSPECTING_BUDGET_CENTS = 500;

export function placesCost(requests: number): number {
  return Number((requests * PLACES_CENTS_PER_REQUEST).toFixed(3));
}

export interface SpendStatus {
  spentCents: number;
  budgetCents: number;
  /** False once the month's spend has reached the cap. */
  ok: boolean;
  /** True when hunts run on Kirei's key rather than the business's own. */
  usingPlatformKey: boolean;
}

/**
 * Month-to-date prospecting spend vs. the business's cap.
 * `budgetCents === 0` means unlimited — an explicit opt-out, not a default.
 */
export async function prospectingSpendStatus(
  sb: SB, businessId: string, opts: { usingPlatformKey?: boolean } = {},
): Promise<SpendStatus> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [{ data: biz }, { data: runs }] = await Promise.all([
    sb.from("businesses").select("prospecting_monthly_budget_cents")
      .eq("id", businessId).maybeSingle(),
    sb.from("prospect_hunt_runs").select("cost_cents")
      .eq("business_id", businessId).gte("started_at", monthStart),
  ]);

  const budgetCents = biz?.prospecting_monthly_budget_cents ?? DEFAULT_PROSPECTING_BUDGET_CENTS;
  // PostgREST returns NUMERIC as a string — plain addition would concatenate.
  const spentCents = ((runs ?? []) as { cost_cents: unknown }[])
    .reduce((sum, r) => sum + (Number(r.cost_cents) || 0), 0);

  return {
    spentCents: Number(spentCents.toFixed(3)),
    budgetCents,
    ok: budgetCents === 0 || spentCents < budgetCents,
    usingPlatformKey: opts.usingPlatformKey ?? false,
  };
}

/** The message a blocked run shows. Says the number and where to change it. */
export function budgetReachedMessage(status: SpendStatus): string {
  return `Monthly prospecting budget reached ($${(status.budgetCents / 100).toFixed(2)}). `
    + `Raise it on the Prospecting page to keep hunting.`;
}
