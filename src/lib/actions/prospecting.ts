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
  active?: boolean;
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
