"use server";

/**
 * The prospecting agent's server actions — hunts, runs, and the review queue.
 *
 * The deliberate shape: `runHuntNow` finds and judges, but nothing becomes a
 * prospect until `addCandidates` is called. The operator is the gate. An agent
 * that writes straight into the prospect list is one bad criteria string away
 * from a list nobody trusts.
 *
 * Scopes on the MCP side: prospects:read / prospects:write.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { geocodeArea } from "@/lib/prospecting/places";
import { getPlacesKey, resolvePlacesKey, runHunt, type HuntRow, type RunResult } from "@/lib/prospecting/run";
import { prospectingSpendStatus, type SpendStatus } from "@/lib/prospecting/budget";
import type {
  ProspectHunt, ProspectHuntRun, ProspectCandidate, ProspectHuntFilters,
  ProspectHuntParam, ProspectHuntSuburb, ProspectHuntAreaMode, ProspectHuntEvent,
} from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);
const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export interface HuntInput {
  name: string;
  queries: string[];
  criteria: string;
  /** A suburb or city — geocoded to a centre point if lat/lng aren't given. */
  area?: string | null;
  centre_lat?: number | null;
  centre_lng?: number | null;
  radius_km?: number;
  filters?: ProspectHuntFilters;
  /** How many verified prospects a run should aim for (1-100). */
  target_count?: number;
  area_mode?: ProspectHuntAreaMode;
  /** Named areas, geocoded on save so a run never pays to look them up. */
  suburb_labels?: string[];
  custom_params?: ProspectHuntParam[];
  active?: boolean;
}

const clampTarget = (n?: number) => Math.min(Math.max(Math.round(n ?? 20), 1), 100);

/** Give every param a stable id — the verifier answers by id, not by label. */
function normaliseParams(params: ProspectHuntParam[]): ProspectHuntParam[] {
  return params
    .filter((p) => p.label?.trim() && p.requirement?.trim())
    .slice(0, 12)
    .map((p, i) => ({
      id: p.id?.trim() || `p${i + 1}`,
      label: p.label.trim().slice(0, 60),
      requirement: p.requirement.trim().slice(0, 400),
      required: Boolean(p.required),
    }));
}

// ── Hunts ───────────────────────────────────────────────────────────────────

export async function listHunts(): Promise<ProspectHunt[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "prospect_hunts").select("*")
    .eq("business_id", businessId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProspectHunt[];
}

export async function getHunt(id: string): Promise<ProspectHunt | null> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "prospect_hunts").select("*")
    .eq("id", id).eq("business_id", businessId).maybeSingle();
  if (error) throw error;
  return (data as ProspectHunt) ?? null;
}

/**
 * Resolve a place name to coordinates using the business's own Places key.
 * Returns null when there's no key — the hunt saves without a centre, and
 * `runHuntNow` is where that's reported, with the fix in the message.
 */
async function resolveArea(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, businessId: string, label: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = await getPlacesKey(supabase, businessId);
  return key ? geocodeArea(key, label) : null;
}

/**
 * Geocode each named suburb once, at save time.
 *
 * Doing it per run would bill a Places request per suburb per run for an
 * answer that never changes. A suburb that can't be found is kept with null
 * coordinates so the operator can see it was dropped, rather than silently
 * vanishing from their service area.
 */
async function geocodeSuburbs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, businessId: string, labels: string[],
): Promise<ProspectHuntSuburb[]> {
  const key = await getPlacesKey(supabase, businessId);
  const out: ProspectHuntSuburb[] = [];
  for (const raw of labels.slice(0, 25)) {
    const label = raw.trim();
    if (!label) continue;
    const found = key ? await geocodeArea(key, label) : null;
    out.push({ label, lat: found?.lat ?? null, lng: found?.lng ?? null, radius_m: 5000 });
  }
  return out;
}

export async function createHunt(input: HuntInput): Promise<ProspectHunt> {
  const { supabase, user, businessId } = await ctx();

  let lat = input.centre_lat ?? null;
  let lng = input.centre_lng ?? null;
  const label = clean(input.area);
  if ((lat == null || lng == null) && label) {
    const found = await resolveArea(supabase, businessId, label);
    if (found) { lat = found.lat; lng = found.lng; }
  }

  const { data, error } = await tbl(supabase, "prospect_hunts").insert({
    business_id: businessId,
    created_by: user.id,
    name: input.name.trim() || "Untitled hunt",
    queries: input.queries.map((q) => q.trim()).filter(Boolean),
    criteria: input.criteria.trim(),
    centre_label: label,
    centre_lat: lat,
    centre_lng: lng,
    radius_m: Math.round(Math.min(Math.max(input.radius_km ?? 25, 1), 50) * 1000),
    filters: input.filters ?? {},
    target_count: clampTarget(input.target_count),
    area_mode: input.area_mode ?? "radius",
    suburbs: input.area_mode === "suburbs" && input.suburb_labels?.length
      ? await geocodeSuburbs(supabase, businessId, input.suburb_labels)
      : [],
    custom_params: normaliseParams(input.custom_params ?? []),
    active: input.active ?? true,
  }).select().single();
  if (error) throw error;

  revalidatePath("/prospects/hunts");
  return data as ProspectHunt;
}

export async function updateHunt(id: string, input: Partial<HuntInput>): Promise<ProspectHunt> {
  const { supabase, businessId } = await ctx();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.queries !== undefined) patch.queries = input.queries.map((q) => q.trim()).filter(Boolean);
  if (input.criteria !== undefined) patch.criteria = input.criteria.trim();
  if (input.filters !== undefined) patch.filters = input.filters;
  if (input.active !== undefined) patch.active = input.active;
  if (input.target_count !== undefined) patch.target_count = clampTarget(input.target_count);
  if (input.area_mode !== undefined) patch.area_mode = input.area_mode;
  if (input.custom_params !== undefined) patch.custom_params = normaliseParams(input.custom_params);
  if (input.suburb_labels !== undefined) {
    patch.suburbs = await geocodeSuburbs(supabase, businessId, input.suburb_labels);
  }
  if (input.radius_km !== undefined) {
    patch.radius_m = Math.round(Math.min(Math.max(input.radius_km, 1), 50) * 1000);
  }
  if (input.centre_lat !== undefined) patch.centre_lat = input.centre_lat;
  if (input.centre_lng !== undefined) patch.centre_lng = input.centre_lng;
  if (input.area !== undefined) {
    const label = clean(input.area);
    patch.centre_label = label;
    // Re-geocode when the area changed but no explicit coordinates came with it.
    if (label && input.centre_lat === undefined) {
      const found = await resolveArea(supabase, businessId, label);
      if (found) { patch.centre_lat = found.lat; patch.centre_lng = found.lng; }
    }
  }

  const { data, error } = await tbl(supabase, "prospect_hunts").update(patch)
    .eq("id", id).eq("business_id", businessId).select().single();
  if (error) throw error;

  revalidatePath("/prospects/hunts");
  revalidatePath(`/prospects/hunts/${id}`);
  return data as ProspectHunt;
}

export async function deleteHunt(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "prospect_hunts").delete()
    .eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/prospects/hunts");
}

// ── Runs ────────────────────────────────────────────────────────────────────

/**
 * Run a hunt synchronously and wait for it.
 *
 * Kept for MCP and any caller that genuinely wants the finished result in
 * hand. The UI does NOT use this — it POSTs to /api/prospecting/run and polls,
 * because a hunt takes minutes and a blocking call is a spinner with no
 * information, plus anything past the function limit loses its results.
 */
export async function runHuntNow(id: string): Promise<RunResult> {
  const { supabase, businessId } = await ctx();
  const { data: hunt, error } = await tbl(supabase, "prospect_hunts").select("*")
    .eq("id", id).eq("business_id", businessId).single();
  if (error) throw error;

  const result = await runHunt(supabase, hunt as HuntRow);

  revalidatePath("/prospects/hunts");
  revalidatePath(`/prospects/hunts/${id}`);
  return result;
}

export interface RunProgress {
  run: ProspectHuntRun | null;
  events: ProspectHuntEvent[];
  /** New candidates already queued by this run, so the queue fills live. */
  verified: ProspectCandidate[];
}

/**
 * One poll of a running hunt: the run row (stage + counters), the events since
 * the last one the client saw, and whatever has been verified so far.
 *
 * `sinceIso` rather than an offset — events are append-only and timestamped,
 * so the client can ask for "anything newer than the last line I have" without
 * the server tracking cursors.
 */
export async function getRunProgress(runId: string, sinceIso?: string): Promise<RunProgress> {
  const { supabase, businessId } = await ctx();

  const { data: run } = await tbl(supabase, "prospect_hunt_runs").select("*")
    .eq("id", runId).eq("business_id", businessId).maybeSingle();
  if (!run) return { run: null, events: [], verified: [] };

  let q = tbl(supabase, "prospect_hunt_events").select("*")
    .eq("run_id", runId).eq("business_id", businessId)
    .order("created_at", { ascending: true }).limit(300);
  if (sinceIso) q = q.gt("created_at", sinceIso);
  const { data: events } = await q;

  const { data: verified } = await tbl(supabase, "prospect_candidates").select("*")
    .eq("run_id", runId).eq("business_id", businessId).eq("status", "verified")
    .order("score", { ascending: false, nullsFirst: false }).limit(100);

  return {
    run: run as ProspectHuntRun,
    events: (events ?? []) as ProspectHuntEvent[],
    verified: (verified ?? []) as ProspectCandidate[],
  };
}

/** The most recent run for a hunt — so a reopened page rejoins one in flight. */
export async function getLatestRun(huntId: string): Promise<ProspectHuntRun | null> {
  const { supabase, businessId } = await ctx();
  const { data } = await tbl(supabase, "prospect_hunt_runs").select("*")
    .eq("hunt_id", huntId).eq("business_id", businessId)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  return (data as ProspectHuntRun) ?? null;
}

export async function listHuntRuns(huntId: string, limit = 20): Promise<ProspectHuntRun[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "prospect_hunt_runs").select("*")
    .eq("business_id", businessId).eq("hunt_id", huntId)
    .order("started_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as ProspectHuntRun[];
}

// ── Budget ──────────────────────────────────────────────────────────────────

/**
 * This month's prospecting spend against the cap, plus whose Places key is
 * paying. The UI needs both: a cap only makes sense to someone who can see
 * what they've spent, and "whose key" changes whether the cap applies at all.
 */
export async function getProspectingBudget(): Promise<SpendStatus> {
  const { supabase, businessId } = await ctx();
  const { platform } = await resolvePlacesKey(supabase, businessId);
  return prospectingSpendStatus(supabase, businessId, { usingPlatformKey: platform });
}

export async function setProspectingBudget(cents: number): Promise<{ budget_cents: number }> {
  const { supabase, businessId } = await ctx();
  const value = Math.max(0, Math.round(cents));
  const { error } = await tbl(supabase, "businesses")
    .update({ prospecting_monthly_budget_cents: value }).eq("id", businessId);
  if (error) throw error;
  revalidatePath("/prospects/hunts");
  return { budget_cents: value };
}

// ── The review queue ────────────────────────────────────────────────────────

export interface CandidateFilters {
  hunt_id?: string;
  /** Defaults to the queue that matters: verified fits awaiting a decision. */
  status?: ProspectCandidate["status"];
  limit?: number;
}

export async function listCandidates(filters: CandidateFilters = {}): Promise<ProspectCandidate[]> {
  const { supabase, businessId } = await ctx();
  let q = tbl(supabase, "prospect_candidates").select("*").eq("business_id", businessId);
  if (filters.hunt_id) q = q.eq("hunt_id", filters.hunt_id);
  q = q.eq("status", filters.status ?? "verified");
  const { data, error } = await q
    .order("score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);
  if (error) throw error;
  return (data ?? []) as ProspectCandidate[];
}

/**
 * Approve candidates — this is the only path from "the agent found it" to
 * "it's in my prospect list".
 */
export async function addCandidates(ids: string[]): Promise<{ added: number }> {
  const { supabase, user, businessId } = await ctx();
  if (!ids.length) return { added: 0 };

  const { data: rows, error } = await tbl(supabase, "prospect_candidates").select("*")
    .eq("business_id", businessId).in("id", ids);
  if (error) throw error;

  const candidates = (rows ?? []) as ProspectCandidate[];
  // Already-added rows carry a prospect_id; adding twice would duplicate.
  const fresh = candidates.filter((c) => !c.prospect_id);
  if (!fresh.length) return { added: 0 };

  const { data: created, error: insertErr } = await tbl(supabase, "prospects").insert(
    fresh.map((c) => ({
      business_id: businessId,
      user_id: user.id,
      company: c.name,
      name: null,
      email: null,                      // Places never returns one
      phone: c.phone,
      website: c.website,
      source: "hunt",
      status: "new",
      tags: c.category ? [c.category] : [],
      notes: [
        c.address,
        c.reasoning ? `Why it matched: ${c.reasoning}` : null,
      ].filter(Boolean).join(" · ") || null,
      custom_fields: {
        place_id: c.place_id,
        hunt_id: c.hunt_id,
        fit_score: c.score,
        rating: c.rating,
        review_count: c.review_count,
      },
    })),
  ).select("id");
  if (insertErr) throw insertErr;

  // Pair each candidate with its new prospect — same order as inserted.
  const newIds = (created ?? []) as { id: string }[];
  await Promise.all(fresh.map((c, i) =>
    tbl(supabase, "prospect_candidates").update({
      status: "added",
      prospect_id: newIds[i]?.id ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", c.id).eq("business_id", businessId),
  ));

  revalidatePath("/prospects");
  revalidatePath("/prospects/hunts");
  return { added: fresh.length };
}

export async function dismissCandidates(ids: string[]): Promise<{ dismissed: number }> {
  const { supabase, businessId } = await ctx();
  if (!ids.length) return { dismissed: 0 };
  const { error } = await tbl(supabase, "prospect_candidates").update({
    status: "dismissed", updated_at: new Date().toISOString(),
  }).eq("business_id", businessId).in("id", ids);
  if (error) throw error;
  revalidatePath("/prospects/hunts");
  return { dismissed: ids.length };
}
