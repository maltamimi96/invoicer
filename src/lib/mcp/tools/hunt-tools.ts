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
import { getPlacesKey, runHunt, type HuntRow } from "@/lib/prospecting/run";

const FILTERS = z.object({
  no_website: z.boolean().optional(),
  has_website: z.boolean().optional(),
  min_rating: z.number().min(0).max(5).optional(),
  max_rating: z.number().min(0).max(5).optional(),
  min_reviews: z.number().int().min(0).optional(),
  max_reviews: z.number().int().min(0).optional(),
  require_phone: z.boolean().optional(),
});

const CANDIDATE_STATUS = z.enum([
  "pending", "screened_out", "verified", "rejected", "added", "dismissed",
]);

const clean = (v?: string) => (v?.trim() ? v.trim() : null);
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

  tool("list_prospect_hunt_runs", "Run history for a hunt, with the funnel counts and what each run cost.",
    { hunt_id: UUID, limit: z.number().int().min(1).max(100).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:read");
      const { data, error } = await t(ctx, "prospect_hunt_runs").select("*")
        .eq("business_id", ctx.businessId).eq("hunt_id", args.hunt_id)
        .order("started_at", { ascending: false }).limit(args.limit ?? 20);
      if (error) throw error;
      return text(data);
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
    "Approve candidates from the review queue and add them to the prospect list. Takes explicit ids — show the operator what was found before calling this.",
    { candidate_ids: z.array(UUID).min(1).max(200) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write");
      const { data: rows, error } = await t(ctx, "prospect_candidates").select("*")
        .eq("business_id", ctx.businessId).in("id", args.candidate_ids);
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fresh = ((rows ?? []) as any[]).filter((c) => !c.prospect_id);
      if (!fresh.length) return text({ added: 0, note: "Nothing new — those are already added." });

      const { data: created, error: insErr } = await t(ctx, "prospects").insert(
        fresh.map((c) => ({
          business_id: ctx.businessId, user_id: ctx.userId,
          company: c.name, name: null, email: null,
          phone: c.phone, website: c.website,
          source: "hunt", status: "new",
          tags: c.category ? [c.category] : [],
          notes: [c.address, c.reasoning ? `Why it matched: ${c.reasoning}` : null]
            .filter(Boolean).join(" · ") || null,
          custom_fields: {
            place_id: c.place_id, hunt_id: c.hunt_id, fit_score: c.score,
            rating: c.rating, review_count: c.review_count,
          },
        })),
      ).select("id");
      if (insErr) throw insErr;

      const newIds = (created ?? []) as { id: string }[];
      await Promise.all(fresh.map((c, i) =>
        t(ctx, "prospect_candidates").update({
          status: "added", prospect_id: newIds[i]?.id ?? null,
          updated_at: new Date().toISOString(),
        }).eq("id", c.id).eq("business_id", ctx.businessId),
      ));

      return text({ added: fresh.length });
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
