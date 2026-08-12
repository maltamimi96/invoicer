/**
 * MCP tools for the prospecting agent — hunts, runs, and the review queue.
 * Scopes: prospects:read / prospects:write.
 *
 * Note what is NOT here: no tool turns a candidate into a prospect without
 * naming the candidates. `add_prospect_candidates` takes explicit ids, so an
 * assistant has to show the operator what it found before anything is added.
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";
import { geocodeArea } from "@/lib/prospecting/places";
import { getPlacesKey, resolvePlacesKey, runHunt, type HuntRow } from "@/lib/prospecting/run";
import { prospectingSpendStatus } from "@/lib/prospecting/budget";
import { approveCandidates } from "@/lib/prospecting/enrol";

const FILTERS = z.object({
  no_website: z.boolean().optional(),
  has_website: z.boolean().optional(),
  min_rating: z.number().min(0).max(5).optional(),
  max_rating: z.number().min(0).max(5).optional(),
  min_reviews: z.number().int().min(0).optional(),
  max_reviews: z.number().int().min(0).optional(),
  require_phone: z.boolean().optional(),
});

const PARAMS = z.array(z.object({
  id: z.string().optional(),
  label: z.string().min(1).describe("Short name, e.g. 'Owner-operator'"),
  requirement: z.string().min(1).describe("What to check, in plain words"),
  required: z.boolean().optional().describe("A failure here disqualifies the business outright"),
})).max(12);

const CANDIDATE_STATUS = z.enum([
  "pending", "screened_out", "verified", "rejected", "added", "dismissed",
]);

const clean = (v?: string) => (v?.trim() ? v.trim() : null);

/** Stable ids — the verifier answers by id, not by label. */
function normaliseParams(
  params: { id?: string; label: string; requirement: string; required?: boolean }[],
) {
  return params.map((p, i) => ({
    id: p.id?.trim() || `p${i + 1}`,
    label: p.label.trim().slice(0, 60),
    requirement: p.requirement.trim().slice(0, 400),
    required: Boolean(p.required),
  }));
}

/**
 * Geocode named suburbs once, at save time — doing it per run would bill a
 * Places request per suburb per run for an answer that never changes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function geocodeSuburbs(sb: any, businessId: string, labels: string[]) {
  const key = await getPlacesKey(sb, businessId);
  const out = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    const found = key ? await geocodeArea(key, label) : null;
    out.push({ label, lat: found?.lat ?? null, lng: found?.lng ?? null, radius_m: 5000 });
  }
  return out;
}
const radiusM = (km?: number) => Math.round(Math.min(Math.max(km ?? 25, 1), 50) * 1000);

export function registerHuntTools(tool: ToolFn): void {
  tool("list_prospect_hunts",
    "List saved prospecting hunts (search terms + area + the criteria a business must meet).",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:read");
      const { data, error } = await t(ctx, "prospect_hunts").select("*")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false });
      if (error) throw error;
      return text(data);
    });

  tool("create_prospect_hunt",
    "Create a prospecting hunt. `criteria` is free text describing what makes a business a prospect (e.g. 'service-based tradies with no website') — an agent judges every result against it. `filters` are cheap hard rules applied before any judging.",
    {
      name: z.string().min(1),
      queries: z.array(z.string().min(1)).min(1).max(10)
        .describe("Google Places search terms, e.g. ['roof repair', 'roofing contractor']"),
      criteria: z.string().min(3),
      area: z.string().optional().describe("Suburb or city to centre the search on"),
      centre_lat: z.number().optional(),
      centre_lng: z.number().optional(),
      radius_km: z.number().min(1).max(50).optional(),
      filters: FILTERS.optional(),
      target_count: z.number().int().min(1).max(100).optional()
        .describe("How many verified prospects this run should aim for. The run stops there."),
      area_mode: z.enum(["radius", "suburbs"]).optional(),
      suburbs: z.array(z.string()).max(25).optional()
        .describe("Named suburbs, each searched separately. Used when area_mode = suburbs."),
      custom_params: PARAMS.optional()
        .describe("Named requirements judged one by one, so a rejection says which failed."),
      campaign_id: UUID.optional()
        .describe("Outreach campaign approved prospects join. The campaign owns the sequence."),
      auto_enrol: z.boolean().optional()
        .describe("Approving a candidate also finds an email and enrols it."),
      auto_approve: z.boolean().optional()
        .describe("Verified candidates skip the review queue. Leave off until the criteria are proven."),
      run_days: z.array(z.number().int().min(0).max(6)).optional()
        .describe("Days this hunt runs itself: 0=Sunday..6=Saturday. e.g. [1] for Mondays only."),
      run_hour: z.number().int().min(0).max(23).optional(),
      timezone: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write");

      let lat = args.centre_lat ?? null;
      let lng = args.centre_lng ?? null;
      const label = clean(args.area);
      if ((lat == null || lng == null) && label) {
        const key = await getPlacesKey(ctx.sb, ctx.businessId);
        const found = key ? await geocodeArea(key, label) : null;
        if (found) { lat = found.lat; lng = found.lng; }
      }

      const { data, error } = await t(ctx, "prospect_hunts").insert({
        business_id: ctx.businessId,
        created_by: ctx.userId,
        name: args.name.trim(),
        queries: args.queries.map((q: string) => q.trim()).filter(Boolean),
        criteria: args.criteria.trim(),
        centre_label: label,
        centre_lat: lat,
        centre_lng: lng,
        radius_m: radiusM(args.radius_km),
        filters: args.filters ?? {},
        target_count: args.target_count ?? 20,
        area_mode: args.area_mode ?? "radius",
        suburbs: args.area_mode === "suburbs"
          ? await geocodeSuburbs(ctx.sb, ctx.businessId, args.suburbs ?? [])
          : [],
        custom_params: normaliseParams(args.custom_params ?? []),
        campaign_id: args.campaign_id ?? null,
        auto_enrol: args.auto_enrol ?? false,
        auto_approve: args.auto_approve ?? false,
        run_days: args.run_days ?? [],
        run_hour: args.run_hour ?? 9,
        timezone: args.timezone ?? "Australia/Sydney",
      }).select("id").single();
      if (error) throw error;

      return text({
        created: true,
        hunt_id: data.id,
        located: lat != null,
        note: lat == null
          ? "No search area resolved — set centre_lat/centre_lng, or add a Google Places API key under Outreach settings so area names can be geocoded."
          : undefined,
      });
    });

  tool("update_prospect_hunt", "Update a hunt's name, search terms, criteria, area or filters.",
    {
      hunt_id: UUID,
      name: z.string().optional(),
      queries: z.array(z.string()).optional(),
      criteria: z.string().optional(),
      area: z.string().optional(),
      centre_lat: z.number().optional(),
      centre_lng: z.number().optional(),
      radius_km: z.number().min(1).max(50).optional(),
      filters: FILTERS.optional(),
      target_count: z.number().int().min(1).max(100).optional(),
      area_mode: z.enum(["radius", "suburbs"]).optional(),
      suburbs: z.array(z.string()).max(25).optional(),
      custom_params: PARAMS.optional(),
      campaign_id: UUID.nullable().optional(),
      auto_enrol: z.boolean().optional(),
      auto_approve: z.boolean().optional(),
      run_days: z.array(z.number().int().min(0).max(6)).optional(),
      run_hour: z.number().int().min(0).max(23).optional(),
      timezone: z.string().optional(),
      active: z.boolean().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (args.name !== undefined) patch.name = args.name.trim();
      if (args.queries !== undefined) patch.queries = args.queries.map((q: string) => q.trim()).filter(Boolean);
      if (args.criteria !== undefined) patch.criteria = args.criteria.trim();
      if (args.filters !== undefined) patch.filters = args.filters;
      if (args.active !== undefined) patch.active = args.active;
      if (args.radius_km !== undefined) patch.radius_m = radiusM(args.radius_km);
      if (args.target_count !== undefined) patch.target_count = args.target_count;
      if (args.campaign_id !== undefined) patch.campaign_id = args.campaign_id;
      if (args.auto_enrol !== undefined) patch.auto_enrol = args.auto_enrol;
      if (args.auto_approve !== undefined) patch.auto_approve = args.auto_approve;
      if (args.run_days !== undefined) patch.run_days = args.run_days;
      if (args.run_hour !== undefined) patch.run_hour = args.run_hour;
      if (args.timezone !== undefined) patch.timezone = args.timezone;
      if (args.area_mode !== undefined) patch.area_mode = args.area_mode;
      if (args.custom_params !== undefined) patch.custom_params = normaliseParams(args.custom_params);
      if (args.suburbs !== undefined) {
        patch.suburbs = await geocodeSuburbs(ctx.sb, ctx.businessId, args.suburbs);
      }
      if (args.centre_lat !== undefined) patch.centre_lat = args.centre_lat;
      if (args.centre_lng !== undefined) patch.centre_lng = args.centre_lng;
      if (args.area !== undefined) {
        const label = clean(args.area);
        patch.centre_label = label;
        if (label && args.centre_lat === undefined) {
          const key = await getPlacesKey(ctx.sb, ctx.businessId);
          const found = key ? await geocodeArea(key, label) : null;
          if (found) { patch.centre_lat = found.lat; patch.centre_lng = found.lng; }
        }
      }
      const { error } = await t(ctx, "prospect_hunts").update(patch)
        .eq("id", args.hunt_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("delete_prospect_hunt", "Delete a hunt and everything it found.",
    { hunt_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write");
      const { error } = await t(ctx, "prospect_hunts").delete()
        .eq("id", args.hunt_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("run_prospect_hunt",
    "Run a hunt now: search Google Places in the area, screen the results against the filters, then have an agent judge each survivor against the criteria. Results land in the review queue — nothing becomes a prospect until it's approved. Slow: one model call per candidate.",
    { hunt_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write");
      const { data: hunt } = await t(ctx, "prospect_hunts").select("*")
        .eq("id", args.hunt_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!hunt) return errorText("Hunt not found");
      const result = await runHunt(ctx.sb, hunt as HuntRow);
      if (result.error) return errorText(result.error);
      return text(result);
    });

  tool("list_prospect_hunt_runs",
    "Run history for a hunt: the funnel counts, what each run cost, and the audit agent's verdict on WHY a run under-delivered (`audit.problems`, each with a concrete fix).",
    { hunt_id: UUID, limit: z.number().int().min(1).max(100).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:read");
      const { data, error } = await t(ctx, "prospect_hunt_runs").select("*")
        .eq("business_id", ctx.businessId).eq("hunt_id", args.hunt_id)
        .order("started_at", { ascending: false }).limit(args.limit ?? 20);
      if (error) throw error;
      return text(data);
    });

  tool("get_prospecting_budget",
    "This month's prospecting spend (Places searches + verification) against the monthly cap, and whether hunts are running on Kirei's shared Google Places key or the business's own.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:read");
      const { platform } = await resolvePlacesKey(ctx.sb, ctx.businessId);
      return text(await prospectingSpendStatus(ctx.sb, ctx.businessId, { usingPlatformKey: platform }));
    });

  tool("set_prospecting_budget",
    "Set the monthly prospecting cap in cents (0 = unlimited). Hunts stop once the month's spend reaches it. Only applies while using Kirei's shared Places key — a business paying Google directly is capped by its own Cloud quota.",
    { cents: z.number().int().min(0) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write");
      const { error } = await t(ctx, "businesses")
        .update({ prospecting_monthly_budget_cents: args.cents }).eq("id", ctx.businessId);
      if (error) throw error;
      return text({ budget_cents: args.cents });
    });

  tool("list_prospect_candidates",
    "The review queue: businesses a hunt found, with the agent's fit score and its reasoning. Defaults to `verified` — the ones judged a match and awaiting a decision.",
    {
      hunt_id: UUID.optional(),
      status: CANDIDATE_STATUS.optional(),
      limit: z.number().int().min(1).max(500).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:read");
      let q = t(ctx, "prospect_candidates")
        .select("id, name, address, phone, website, category, rating, review_count, status, score, reasoning, checks, prospect_id, created_at")
        .eq("business_id", ctx.businessId).eq("status", args.status ?? "verified");
      if (args.hunt_id) q = q.eq("hunt_id", args.hunt_id);
      const { data, error } = await q
        .order("score", { ascending: false, nullsFirst: false })
        .limit(args.limit ?? 100);
      if (error) throw error;
      return text(data);
    });

  tool("add_prospect_candidates",
    "Approve candidates from the review queue: creates prospects, looks for a contact address on each business's own website (if the crawler is enabled), and enrols them in the hunt's outreach campaign when the hunt is set to. Takes explicit ids — show the operator what was found before calling this.",
    { candidate_ids: z.array(UUID).min(1).max(200) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write");
      const { data: rows, error } = await t(ctx, "prospect_candidates").select("*")
        .eq("business_id", ctx.businessId).in("id", args.candidate_ids);
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidates = ((rows ?? []) as any[]);
      const huntId = candidates[0]?.hunt_id ?? null;
      const { data: hunt } = huntId
        ? await t(ctx, "prospect_hunts").select("id, campaign_id, auto_enrol")
            .eq("id", huntId).eq("business_id", ctx.businessId).maybeSingle()
        : { data: null };

      // Same code as the server action. Two copies of this is how the previous
      // version paired candidates to prospects by array index in one place and
      // not the other.
      return text(await approveCandidates(ctx.sb, ctx.businessId, ctx.userId, candidates, hunt));
    });

  tool("dismiss_prospect_candidates", "Dismiss candidates from the review queue so they stop appearing.",
    { candidate_ids: z.array(UUID).min(1).max(500) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write");
      const { error } = await t(ctx, "prospect_candidates").update({
        status: "dismissed", updated_at: new Date().toISOString(),
      }).eq("business_id", ctx.businessId).in("id", args.candidate_ids);
      if (error) throw error;
      return text({ dismissed: args.candidate_ids.length });
    });
}
