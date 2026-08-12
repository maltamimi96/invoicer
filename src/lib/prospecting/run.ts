/**
 * The hunt orchestrator: search → screen → verify → audit.
 *
 * The order is the whole design. Places is billed per request, the verifying
 * agent is billed per candidate, and the operator's attention is the scarcest
 * of the three — so each stage is cheaper than the one it feeds, and nothing
 * reaches a human that a filter could have thrown away.
 *
 * Two things shape the loop beyond that:
 *
 * - It stops at the TARGET, not at the end of the list. Asking for 10 and
 *   paying to judge 200 is the failure mode that makes an agent expensive for
 *   no benefit.
 * - It narrates. A run takes minutes and used to return nothing until it was
 *   done, which reads as a hang. Every stage writes events and progress
 *   counters the UI polls.
 *
 * Nothing here creates a prospect. Candidates land in a review queue and a
 * person approves them.
 */

import { decryptSecret } from "@/lib/crypto";
import { searchPlaces, type PlaceHit, type SearchArea } from "./places";
import { screenCandidate, phoneKey, type HuntFilters } from "./screen";
import { verifyCandidate } from "./verify";
import { auditRun, type AuditInput } from "./audit";
import { budgetReachedMessage, placesCost, prospectingSpendStatus } from "./budget";
import type {
  ProspectHuntParam, ProspectHuntSuburb, ProspectHuntAreaMode, ProspectHuntStage,
} from "@/types/database";

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
  target_count: number;
  area_mode: ProspectHuntAreaMode;
  suburbs: ProspectHuntSuburb[];
  custom_params: ProspectHuntParam[];
}

export interface RunResult {
  run_id: string | null;
  found: number;
  screened_out: number;
  verified: number;
  rejected: number;
  cost_cents: number;
  places_requests: number;
  places_cost_cents: number;
  model_cost_cents: number;
  error: string | null;
  budget_stopped?: boolean;
}

/**
 * Hard ceiling on judgements per run, regardless of target.
 *
 * The target usually stops the loop first. This catches the case where almost
 * nothing is a fit: asking for 100 in a suburb where 3 qualify would otherwise
 * judge every business in the area looking for a 4th.
 */
const VERIFY_CEILING = 120;

/**
 * The Places key: the business's own if set, else Kirei's.
 *
 * Their key wins deliberately. An agency that brought its own wants its own
 * quota and billing relationship with Google; silently spending the platform's
 * would be wrong even though it works.
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

  const { data: seen } = await sb.from("prospect_candidates")
    .select("place_id").eq("business_id", businessId).limit(10000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of ((seen ?? []) as any[])) if (c.place_id) placeIds.add(String(c.place_id));

  return { phones, websites, placeIds };
}

/** The areas to search: one circle, or each named suburb in turn. */
function areasFor(hunt: HuntRow): { label: string; area: SearchArea }[] {
  if (hunt.area_mode === "suburbs") {
    return (hunt.suburbs ?? [])
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({
        label: s.label,
        area: { lat: s.lat!, lng: s.lng!, radiusM: s.radius_m || 5000 },
      }));
  }
  if (hunt.centre_lat == null || hunt.centre_lng == null) return [];
  return [{
    label: hunt.centre_label ?? "the search area",
    area: { lat: hunt.centre_lat, lng: hunt.centre_lng, radiusM: hunt.radius_m || 25000 },
  }];
}

/**
 * Write candidates, and NOTICE when it fails.
 *
 * The original code called `.upsert(...)` and never looked at `error`. The
 * conflict target was a partial unique index, which Postgres refuses to use as
 * an ON CONFLICT arbiter, so every single write raised 42P10 — and a hunt
 * searched Google, screened 93 businesses, paid to judge 5 of them, reported
 * "5 to review" and stored nothing. CLAUDE.md already says to check `error`,
 * not just `data`; this is that rule costing money.
 *
 * Returns the error message so the run can report it rather than claim a
 * success it didn't have.
 */
async function writeCandidates(sb: SB, rows: Record<string, unknown>[]): Promise<string | null> {
  if (!rows.length) return null;
  const { error } = await sb.from("prospect_candidates")
    .upsert(rows, { onConflict: "business_id,place_id", ignoreDuplicates: true });
  return error ? (error.message ?? "Couldn't save candidates") : null;
}

export async function runHunt(sb: SB, hunt: HuntRow, existingRunId?: string): Promise<RunResult> {
  const result: RunResult = {
    run_id: existingRunId ?? null, found: 0, screened_out: 0, verified: 0, rejected: 0,
    cost_cents: 0, places_requests: 0, places_cost_cents: 0, model_cost_cents: 0,
    error: null,
  };

  if (!result.run_id) {
    const { data: run } = await sb.from("prospect_hunt_runs").insert({
      business_id: hunt.business_id, hunt_id: hunt.id, status: "running", stage: "queued",
    }).select("id").single();
    result.run_id = run?.id ?? null;
  }

  /** Narration. Never throws — a logging failure must not lose a run. */
  const say = async (message: string, level: "info" | "success" | "warn" | "error" = "info") => {
    try {
      await sb.from("prospect_hunt_events").insert({
        business_id: hunt.business_id, hunt_id: hunt.id, run_id: result.run_id, level, message,
      });
    } catch { /* the run matters more than its commentary */ }
  };

  const progress = async (stage: ProspectHuntStage, processed = 0, total = 0) => {
    try {
      await sb.from("prospect_hunt_runs")
        .update({ stage, processed, total }).eq("id", result.run_id);
    } catch { /* same */ }
  };

  const finish = async (
    status: "done" | "failed" | "cancelled", message: string | null,
  ) => {
    result.error = message;
    if (result.run_id) {
      await sb.from("prospect_hunt_runs").update({
        status,
        stage: "finished",
        found: result.found,
        screened_out: result.screened_out,
        verified: result.verified,
        rejected: result.rejected,
        cost_cents: result.cost_cents,
        places_requests: result.places_requests,
        places_cost_cents: result.places_cost_cents,
        model_cost_cents: result.model_cost_cents,
        error: message,
        finished_at: new Date().toISOString(),
      }).eq("id", result.run_id);
    }
    return result;
  };

  // ── Preflight ────────────────────────────────────────────────────────────
  const { key: apiKey, platform } = await resolvePlacesKey(sb, hunt.business_id);
  if (!apiKey) {
    await say("No Google Places key available.", "error");
    return finish("failed", "No Google Places key available. Add your own under Outreach settings, or ask an admin to configure Kirei's.");
  }

  if (platform) {
    const status = await prospectingSpendStatus(sb, hunt.business_id, { usingPlatformKey: true });
    if (!status.ok) {
      // `cancelled`, not `failed` — hitting your own cap is the system working.
      result.budget_stopped = true;
      await say(budgetReachedMessage(status), "warn");
      return finish("cancelled", budgetReachedMessage(status));
    }
  }

  const areas = areasFor(hunt);
  if (!areas.length) {
    await say("This hunt has no search area.", "error");
    return finish("failed", hunt.area_mode === "suburbs"
      ? "No suburbs on this hunt could be located. Add at least one."
      : "This hunt has no search area. Set a centre point and radius.");
  }
  if (!hunt.queries?.length) {
    await say("This hunt has no search terms.", "error");
    return finish("failed", "This hunt has no search terms.");
  }

  const target = Math.min(Math.max(hunt.target_count || 20, 1), 100);
  const params = hunt.custom_params ?? [];

  await say(`Hunting for ${target} ${target === 1 ? "prospect" : "prospects"} · `
    + `${hunt.queries.length} search ${hunt.queries.length === 1 ? "term" : "terms"} · `
    + `${areas.length} ${areas.length === 1 ? "area" : "areas"}`
    + (params.length ? ` · ${params.length} named ${params.length === 1 ? "requirement" : "requirements"}` : ""));

  const known = await knownContacts(sb, hunt.business_id);

  // ── 1. Search ────────────────────────────────────────────────────────────
  const totalSearches = hunt.queries.length * areas.length;
  await progress("searching", 0, totalSearches);

  const hits = new Map<string, PlaceHit>();
  const searchErrors: string[] = [];
  let done = 0;

  for (const { label, area } of areas) {
    for (const query of hunt.queries) {
      const { hits: batch, error, requests } = await searchPlaces(apiKey, query, area);
      result.places_requests += requests;
      done++;

      if (error) {
        searchErrors.push(error);
        await say(`"${query}" in ${label} failed — ${error}`, "error");
      } else {
        // Overlapping queries return the same businesses; the map means each
        // is judged once, not once per query.
        let fresh = 0;
        for (const h of batch) if (!hits.has(h.place_id)) { hits.set(h.place_id, h); fresh++; }
        await say(`"${query}" in ${label} — ${batch.length} found, ${fresh} new`);
      }
      await progress("searching", done, totalSearches);
    }
  }

  result.places_cost_cents = placesCost(result.places_requests);
  result.cost_cents = result.places_cost_cents;

  if (!hits.size) {
    const why = searchErrors[0]
      ?? "Google returned nothing for those terms in that area. Try broader terms or a wider radius.";
    await say(why, "error");
    return finish(searchErrors.length ? "failed" : "done", why);
  }
  result.found = hits.size;
  await say(`${result.found} businesses found`, "success");

  // ── 2. Screen ────────────────────────────────────────────────────────────
  await progress("screening", 0, result.found);

  const survivors: PlaceHit[] = [];
  const rejects: { hit: PlaceHit; reason: string; checks: Record<string, unknown> }[] = [];
  const screenReasons: Record<string, number> = {};
  let screened = 0;

  for (const hit of hits.values()) {
    screened++;
    if (known.placeIds.has(hit.place_id)) {
      result.screened_out++;
      screenReasons["Already seen by an earlier run"] =
        (screenReasons["Already seen by an earlier run"] ?? 0) + 1;
      continue;
    }
    const verdict = screenCandidate(hit, hunt.filters ?? {}, known);
    if (verdict.keep) survivors.push(hit);
    else {
      result.screened_out++;
      screenReasons[verdict.reason] = (screenReasons[verdict.reason] ?? 0) + 1;
      rejects.push({ hit, reason: verdict.reason, checks: verdict.checks });
    }
  }
  await progress("screening", screened, result.found);

  // Screened-out rows are still written: they're why the funnel adds up, and
  // they stop the next run re-finding the same rejects.
  const screenWriteError = await writeCandidates(sb, rejects.map(({ hit, reason, checks }) => ({
    ...candidateRow(hunt, result.run_id, hit),
    status: "screened_out", reasoning: reason, checks,
  })));
  if (screenWriteError) {
    await say(`Couldn't save screened-out businesses — ${screenWriteError}`, "error");
    return finish("failed", `Couldn't save results: ${screenWriteError}`);
  }

  await say(`${survivors.length} past the filters, ${result.screened_out} removed`,
    survivors.length ? "success" : "warn");

  // ── 3. Verify, stopping at the target ────────────────────────────────────
  const ceiling = Math.min(survivors.length, VERIFY_CEILING);
  await progress("verifying", 0, Math.min(ceiling, Math.max(target, 1)));

  const paramFailures: Record<string, number> = {};
  const sampleRejections: string[] = [];
  let judged = 0;

  for (const hit of survivors.slice(0, ceiling)) {
    if (result.verified >= target) {
      await say(`Target of ${target} reached — stopping early, ${survivors.length - judged} left unjudged`, "success");
      break;
    }

    // Re-checked periodically: a run spends for minutes, and the point of a
    // cap is that it stops the spending in progress.
    if (platform && judged > 0 && judged % 10 === 0) {
      const status = await prospectingSpendStatus(sb, hunt.business_id, { usingPlatformKey: true });
      if (status.budgetCents !== 0 && status.spentCents + result.cost_cents >= status.budgetCents) {
        result.budget_stopped = true;
        await say(budgetReachedMessage(status), "warn");
        break;
      }
    }

    let verdict;
    try {
      verdict = await verifyCandidate(hit, hunt.criteria, params);
    } catch (e) {
      // One failed judgement shouldn't lose the rest of the run.
      verdict = {
        fit: false, score: 0, cost_cents: 0, params: [],
        reasoning: e instanceof Error ? e.message : "Verification failed",
      };
    }
    judged++;

    result.model_cost_cents = Number((result.model_cost_cents + verdict.cost_cents).toFixed(3));
    result.cost_cents = Number((result.places_cost_cents + result.model_cost_cents).toFixed(3));

    if (verdict.fit) {
      result.verified++;
      await say(`${hit.name} — ${verdict.score}% · ${verdict.reasoning}`, "success");
    } else {
      result.rejected++;
      if (sampleRejections.length < 8) sampleRejections.push(`${hit.name}: ${verdict.reasoning}`);
      for (const p of verdict.params) {
        if (!p.pass) paramFailures[p.label] = (paramFailures[p.label] ?? 0) + 1;
      }
    }

    // Written one at a time so a judgement is never paid for twice: if this
    // throws we stop here rather than carrying on spending.
    const writeError = await writeCandidates(sb, [{
      ...candidateRow(hunt, result.run_id, hit),
      status: verdict.fit ? "verified" : "rejected",
      score: verdict.score,
      reasoning: verdict.reasoning,
      checks: { screened: "passed" },
      param_results: verdict.params,
    }]);
    if (writeError) {
      await say(`Couldn't save "${hit.name}" — ${writeError}`, "error");
      return finish("failed", `Couldn't save results: ${writeError}`);
    }

    await progress("verifying", result.verified, target);
  }

  // ── 4. Audit the run itself ──────────────────────────────────────────────
  await progress("auditing", 0, 1);
  await say("Reviewing how the run went…");

  const auditInput: AuditInput = {
    criteria: hunt.criteria,
    params,
    queries: hunt.queries,
    areaLabel: areas.map((a) => a.label).join(", "),
    filters: (hunt.filters ?? {}) as Record<string, unknown>,
    target,
    found: result.found,
    screenedOut: result.screened_out,
    verified: result.verified,
    rejected: result.rejected,
    screenReasons,
    paramFailures,
    sampleRejections,
  };

  const audit = await auditRun(auditInput);
  result.model_cost_cents = Number((result.model_cost_cents + audit.cost_cents).toFixed(3));
  result.cost_cents = Number((result.places_cost_cents + result.model_cost_cents).toFixed(3));

  if (result.run_id) {
    await sb.from("prospect_hunt_runs").update({
      audit: { summary: audit.summary, problems: audit.problems },
    }).eq("id", result.run_id);
  }
  for (const p of audit.problems) {
    await say(`${p.title} — ${p.fix}`, p.severity === "high" ? "warn" : "info");
  }

  const shortfall = result.verified < target;
  await say(
    `Done — ${result.verified} to review (asked for ${target}), $${(result.cost_cents / 100).toFixed(2)} spent`,
    shortfall ? "warn" : "success",
  );

  return finish("done", result.budget_stopped
    ? "Stopped on the monthly budget before reaching the target. Raise it to continue."
    : searchErrors[0] ?? null);
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
