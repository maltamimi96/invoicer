/**
 * The hunt orchestrator: search → screen → verify → queue for review.
 *
 * The order is the whole design. Places is billed per request, the verifying
 * agent is billed per candidate, and the operator's attention is the scarcest
 * of the three — so each stage is cheaper than the one it feeds, and nothing
 * reaches a human that a filter could have thrown away.
 *
 * Nothing here creates a prospect. Candidates land in a review queue and a
 * person approves them. An agent that silently filled your prospect list with
 * its own guesses would be worse than no agent at all.
 */

import { decryptSecret } from "@/lib/crypto";
import { searchPlaces, type PlaceHit, type SearchArea } from "./places";
import { screenCandidate, phoneKey, type HuntFilters } from "./screen";
import { verifyCandidate } from "./verify";
import { budgetReachedMessage, placesCost, prospectingSpendStatus } from "./budget";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export interface HuntRow {
  id: string;
  business_id: string;
  name: string;
  queries: string[];
  centre_label: string | null;
  centre_lat: number | null;
  centre_lng: number | null;
  radius_m: number;
  criteria: string;
  filters: HuntFilters;
}

export interface RunResult {
  run_id: string | null;
  found: number;
  screened_out: number;
  verified: number;
  rejected: number;
  /** Total: Places requests + verify calls. What the monthly budget meters. */
  cost_cents: number;
  places_requests: number;
  places_cost_cents: number;
  model_cost_cents: number;
  error: string | null;
  /** Set when the run stopped early because the month's budget ran out. */
  budget_stopped?: boolean;
}

/** How many survivors we're willing to pay a model to judge in one run. */
const VERIFY_CAP = 60;

/**
 * The Places key to search with: the business's own if they've set one, else
 * Kirei's.
 *
 * Their key wins deliberately. An agency that brought its own key wants its
 * own quota and its own billing relationship with Google — silently spending
 * the platform's instead would be the wrong answer even though it works. The
 * platform key exists so a sole trader who will never open Google Cloud can
 * still use the feature at all, and it's metered (see budget.ts) because it's
 * shared.
 */
export async function resolvePlacesKey(
  sb: SB, businessId: string,
): Promise<{ key: string | null; platform: boolean }> {
  const { data } = await sb.from("outreach_settings")
    .select("places_api_key_enc").eq("business_id", businessId).maybeSingle();

  if (data?.places_api_key_enc) {
    try { return { key: decryptSecret(data.places_api_key_enc), platform: false }; }
    catch { /* undecryptable — fall through to the platform key */ }
  }
  const platform = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return platform ? { key: platform, platform: true } : { key: null, platform: false };
}

/** Back-compat shim for callers that only need a usable key (geocoding). */
export async function getPlacesKey(sb: SB, businessId: string): Promise<string | null> {
  return (await resolvePlacesKey(sb, businessId)).key;
}

/**
 * Everything this business already knows about, so the hunt only surfaces new
 * names. Prospects AND customers — finding your own client and calling them a
 * prospect is the failure that makes people stop trusting the tool.
 */
async function knownContacts(sb: SB, businessId: string) {
  const phones = new Set<string>();
  const websites = new Set<string>();
  const placeIds = new Set<string>();

  const add = (phone: unknown, website: unknown) => {
    const pk = phoneKey(typeof phone === "string" ? phone : null);
    if (pk) phones.add(pk);
    if (typeof website === "string" && website) {
      try {
        websites.add(new URL(website).hostname.toLowerCase().replace(/^www\./, ""));
      } catch { /* not a URL — nothing to dedupe on */ }
    }
  };

  const { data: prospects } = await sb.from("prospects")
    .select("phone, website, custom_fields").eq("business_id", businessId).limit(5000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of ((prospects ?? []) as any[])) {
    add(p.phone, p.website);
    const pid = (p.custom_fields ?? {}).place_id;
    if (pid) placeIds.add(String(pid));
  }

  const { data: customers } = await sb.from("customers")
    .select("phone, website").eq("business_id", businessId).limit(5000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of ((customers ?? []) as any[])) add(c.phone, c.website);

  // Candidates already seen by a previous run of any hunt — the unique index
  // would reject them anyway, and re-verifying them would be paid-for waste.
  const { data: seen } = await sb.from("prospect_candidates")
    .select("place_id").eq("business_id", businessId).limit(10000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of ((seen ?? []) as any[])) if (c.place_id) placeIds.add(String(c.place_id));

  return { phones, websites, placeIds };
}

/**
 * Execute one hunt.
 *
 * Long-running by nature (one model call per survivor), so callers should
 * treat it as a job, not a request handler.
 */
export async function runHunt(sb: SB, hunt: HuntRow): Promise<RunResult> {
  const result: RunResult = {
    run_id: null, found: 0, screened_out: 0, verified: 0, rejected: 0,
    cost_cents: 0, places_requests: 0, places_cost_cents: 0, model_cost_cents: 0,
    error: null,
  };

  const { data: run } = await sb.from("prospect_hunt_runs").insert({
    business_id: hunt.business_id, hunt_id: hunt.id, status: "running",
  }).select("id").single();
  result.run_id = run?.id ?? null;

  const fail = async (message: string) => {
    result.error = message;
    if (result.run_id) {
      await sb.from("prospect_hunt_runs").update({
        status: "failed", error: message, finished_at: new Date().toISOString(),
      }).eq("id", result.run_id);
    }
    return result;
  };

  const { key: apiKey, platform } = await resolvePlacesKey(sb, hunt.business_id);
  if (!apiKey) {
    return fail("No Google Places key available. Add your own under Outreach settings, or ask an admin to configure Kirei's.");
  }

  // The gate, before a cent is spent. Only meters the platform key — a
  // business paying Google directly is capped by their own Cloud quota, and
  // metering their spend against ours would be us rationing their money.
  if (platform) {
    const status = await prospectingSpendStatus(sb, hunt.business_id, { usingPlatformKey: true });
    if (!status.ok) {
      // `cancelled`, not `failed` — hitting your own cap is the system working.
      // Filing it as a failure would make the run history read like the hunt
      // is broken.
      result.budget_stopped = true;
      result.error = budgetReachedMessage(status);
      if (result.run_id) {
        await sb.from("prospect_hunt_runs").update({
          status: "cancelled", error: result.error, finished_at: new Date().toISOString(),
        }).eq("id", result.run_id);
      }
      return result;
    }
  }

  if (hunt.centre_lat == null || hunt.centre_lng == null) {
    return fail("This hunt has no search area. Set a centre point and radius.");
  }
  if (!hunt.queries?.length) {
    return fail("This hunt has no search terms.");
  }

  const area: SearchArea = {
    lat: hunt.centre_lat, lng: hunt.centre_lng, radiusM: hunt.radius_m || 25000,
  };
  const known = await knownContacts(sb, hunt.business_id);

  // ── 1. Search ────────────────────────────────────────────────────────────
  const hits = new Map<string, PlaceHit>();
  const searchErrors: string[] = [];
  for (const query of hunt.queries) {
    const { hits: batch, error, requests } = await searchPlaces(apiKey, query, area);
    result.places_requests += requests;
    if (error) searchErrors.push(error);
    // Overlapping queries ("roof repair" / "roofing contractor") return the
    // same businesses; the map means each is judged once, not once per query.
    for (const h of batch) if (!hits.has(h.place_id)) hits.set(h.place_id, h);
  }
  result.places_cost_cents = placesCost(result.places_requests);
  result.cost_cents = result.places_cost_cents;
  if (!hits.size && searchErrors.length) return fail(searchErrors[0]);
  result.found = hits.size;

  // ── 2. Screen ────────────────────────────────────────────────────────────
  const survivors: PlaceHit[] = [];
  const rejects: { hit: PlaceHit; reason: string; checks: Record<string, unknown> }[] = [];

  for (const hit of hits.values()) {
    if (known.placeIds.has(hit.place_id)) { result.screened_out++; continue; }
    const verdict = screenCandidate(hit, hunt.filters ?? {}, known);
    if (verdict.keep) survivors.push(hit);
    else {
      result.screened_out++;
      rejects.push({ hit, reason: verdict.reason, checks: verdict.checks });
    }
  }

  // Screened-out rows are still written: they're why the funnel numbers add up,
  // and they stop the next run re-finding the same rejects.
  if (rejects.length) {
    await sb.from("prospect_candidates").upsert(
      rejects.map(({ hit, reason, checks }) => ({
        ...candidateRow(hunt, result.run_id, hit),
        status: "screened_out", reasoning: reason, checks,
      })),
      { onConflict: "business_id,place_id", ignoreDuplicates: true },
    );
  }

  // ── 3. Verify ────────────────────────────────────────────────────────────
  const toVerify = survivors.slice(0, VERIFY_CAP);
  const overflow = survivors.length - toVerify.length;

  let budgetStoppedAt = 0;

  for (const [i, hit] of toVerify.entries()) {
    // Re-checked every few candidates, not just once at the top: a run can
    // spend for minutes, and the whole point of a cap is that it stops the
    // spending in progress rather than reporting it afterwards.
    if (platform && i > 0 && i % 10 === 0) {
      const status = await prospectingSpendStatus(sb, hunt.business_id, { usingPlatformKey: true });
      if (!(status.spentCents + result.cost_cents < status.budgetCents) && status.budgetCents !== 0) {
        result.budget_stopped = true;
        budgetStoppedAt = toVerify.length - i;
        break;
      }
    }

    let verdict;
    try {
      verdict = await verifyCandidate(hit, hunt.criteria);
    } catch (e) {
      // One failed judgement shouldn't lose the rest of the run. It stays
      // pending so a re-run can pick it up.
      verdict = {
        fit: false, score: 0, cost_cents: 0,
        reasoning: e instanceof Error ? e.message : "Verification failed",
      };
    }
    result.model_cost_cents = Number((result.model_cost_cents + verdict.cost_cents).toFixed(3));
    result.cost_cents = Number((result.places_cost_cents + result.model_cost_cents).toFixed(3));
    if (verdict.fit) result.verified++; else result.rejected++;

    await sb.from("prospect_candidates").upsert({
      ...candidateRow(hunt, result.run_id, hit),
      status: verdict.fit ? "verified" : "rejected",
      score: verdict.score,
      reasoning: verdict.reasoning,
      checks: { screened: "passed" },
    }, { onConflict: "business_id,place_id", ignoreDuplicates: true });
  }

  if (result.run_id) {
    await sb.from("prospect_hunt_runs").update({
      status: "done",
      found: result.found,
      screened_out: result.screened_out,
      verified: result.verified,
      rejected: result.rejected,
      cost_cents: result.cost_cents,
      places_requests: result.places_requests,
      places_cost_cents: result.places_cost_cents,
      model_cost_cents: result.model_cost_cents,
      // Never silently drop coverage: if either cap bit, say so on the run.
      error: result.budget_stopped
        ? `Stopped on the monthly budget with ${budgetStoppedAt} left to check. Raise the budget to finish.`
        : overflow > 0
          ? `${overflow} more matched the filters but weren't verified this run (cap ${VERIFY_CAP}). Run again to continue.`
          : searchErrors[0] ?? null,
      finished_at: new Date().toISOString(),
    }).eq("id", result.run_id);
  }

  return result;
}

function candidateRow(hunt: HuntRow, runId: string | null, hit: PlaceHit) {
  return {
    business_id: hunt.business_id,
    hunt_id: hunt.id,
    run_id: runId,
    place_id: hit.place_id,
    name: hit.name,
    address: hit.address,
    phone: hit.phone,
    website: hit.website,
    category: hit.category,
    rating: hit.rating,
    review_count: hit.review_count,
    lat: hit.lat,
    lng: hit.lng,
    raw: hit.raw,
  };
}
