/**
 * MCP tools for the Content Studio plugin.
 *
 * Standing rule: every capability the app has, the AI has. These mirror
 * src/lib/actions/content.ts — but MCP requests are API-key-authed, not cookie,
 * so the actions can't be reused and the queries run through the admin client
 * scoped by business_id (the same pattern as seo-tools.ts).
 *
 * Scopes: content:read / content:write.
 *
 * Piece-level tools say "social" rather than "content": the SEO plugin already
 * owns list_content_pieces / get_content_piece / start_content_pipeline for
 * ARTICLES. Those names are live in Claude Code and the claude.ai connector, so
 * renaming them to free the word up would break existing callers — the newer
 * plugin yields. The collect.ts uniqueness test is what caught this.
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";
import { validPlatforms, type ContentKind } from "@/lib/content/pipeline";
import { spendStatus } from "@/lib/content/engine";
import { planDates, CADENCES } from "@/lib/content/schedule";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
const CADENCE = z.enum(CADENCES.map((c) => c.id) as [string, ...string[]]);

const LIST = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .describe("List, or a comma-separated string");

/** The actions take either shape; the tools should be as forgiving. */
function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export function registerContentTools(tool: ToolFn): void {
  tool("list_content_brands", "List the client brands this business creates social content for.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:read");
      const { data, error } = await t(ctx, "content_brands")
        .select("id, name, industry, service_area, services, status, customer_id, created_at")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return text(data);
    });

  tool("get_content_brand", "Get one content brand including its full voice profile.",
    { brand_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:read");
      const { data } = await t(ctx, "content_brands")
        .select("*, customers(name, email)")
        .eq("id", args.brand_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return errorText("Brand not found");
      return text(data);
    });

  tool("create_content_brand",
    "Create a client brand. The voice fields are read by every agent on every run — the more specific, the less generic the output.",
    {
      name: z.string().min(1),
      customer_id: UUID.optional().describe("Link to the customer record for this client"),
      industry: z.string().optional().describe("e.g. Roofing"),
      service_area: z.string().optional(),
      services: LIST,
      audience: z.string().optional(),
      voice: z.string().optional().describe("How they talk — brief it like a copywriter"),
      tone: z.string().optional(),
      proof_points: z.string().optional().describe("Claims they can stand behind; compliance flags anything beyond these"),
      banned_phrases: LIST,
      examples: z.string().optional().describe("Real posts that landed. Worth more than every other field."),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:write");
      const { data, error } = await t(ctx, "content_brands")
        .insert({
          business_id: ctx.businessId,
          customer_id: args.customer_id ?? null,
          name: args.name,
          industry: args.industry ?? null,
          service_area: args.service_area ?? null,
          services: toList(args.services),
          audience: args.audience ?? null,
          voice: args.voice ?? null,
          tone: args.tone ?? null,
          proof_points: args.proof_points ?? null,
          banned_phrases: toList(args.banned_phrases),
          examples: args.examples ?? null,
        })
        .select("id, name").single();
      if (error) throw error;
      return text(data);
    });

  tool("update_content_brand", "Update a client brand's voice profile. Only the fields you pass change.",
    {
      brand_id: UUID,
      name: z.string().optional(),
      customer_id: UUID.optional(),
      industry: z.string().optional(),
      service_area: z.string().optional(),
      services: LIST,
      audience: z.string().optional(),
      voice: z.string().optional(),
      tone: z.string().optional(),
      proof_points: z.string().optional(),
      banned_phrases: LIST,
      examples: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:write");
      // A partial update must not blank what wasn't sent.
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "customer_id", "industry", "service_area", "audience",
        "voice", "tone", "proof_points", "examples"] as const) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      if (args.services !== undefined) patch.services = toList(args.services);
      if (args.banned_phrases !== undefined) patch.banned_phrases = toList(args.banned_phrases);
      if (Object.keys(patch).length === 0) return errorText("Nothing to update");

      const { error } = await t(ctx, "content_brands")
        .update(patch).eq("id", args.brand_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ ok: true });
    });

  tool("run_content_topic_scout",
    "Queue the Topic Scout to research this client's trade and season and propose topics. It runs for a few minutes — poll list_content_topics.",
    { brand_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:write");

      const budget = await spendStatus(ctx.sb, ctx.businessId);
      if (!budget.ok) return errorText("This month's content budget is used up.");

      // One scout at a time per brand — it's the most expensive call in the plugin.
      const { data: busy } = await t(ctx, "content_jobs")
        .select("id").eq("business_id", ctx.businessId).eq("brand_id", args.brand_id)
        .eq("type", "topic_scout").in("status", ["queued", "running"]).limit(1);
      if (busy?.length) return errorText("The scout is already running for this brand.");

      const { data, error } = await t(ctx, "content_jobs")
        .insert({
          business_id: ctx.businessId, brand_id: args.brand_id,
          type: "topic_scout", status: "queued", step: 0, input: {},
        })
        .select("id").single();
      if (error) throw error;
      return text({ queued: true, job_id: data.id });
    });

  tool("list_content_topics", "List the topics the scout has found for a brand.",
    { brand_id: UUID, status: z.enum(["queued", "in_progress", "done", "dismissed"]).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:read");
      let q = t(ctx, "content_topics")
        .select("id, title, detail, angle_hint, season, priority, status, source_urls, created_at")
        .eq("business_id", ctx.businessId).eq("brand_id", args.brand_id)
        .order("priority", { ascending: false }).limit(100);
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("start_social_piece",
    "Queue the content pipeline for one topic. Produces angle_count x platforms variations. Pass topic_id to carry the scout's research into the chain.",
    {
      brand_id: UUID,
      topic: z.string().min(1),
      kind: z.enum(["script", "post", "hooks"]).describe("script = short video; post = caption; hooks = openers only"),
      platforms: z.array(z.enum(["instagram", "facebook", "tiktok", "linkedin", "youtube"]))
        .optional().describe("Not needed for kind=hooks"),
      angle_count: z.number().int().min(1).max(6).optional(),
      topic_id: UUID.optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:write");

      const platforms = validPlatforms(args.platforms ?? []);
      if (args.kind !== "hooks" && platforms.length === 0) {
        return errorText("Pick at least one platform.");
      }

      const budget = await spendStatus(ctx.sb, ctx.businessId);
      if (!budget.ok) return errorText("This month's content budget is used up.");

      // Carry the research forward — the handoff the SEO chain never wires.
      const artifacts: Record<string, { content: string; created_at: string }> = {};
      if (args.topic_id) {
        const { data: topic } = await t(ctx, "content_topics")
          .select("title, detail, angle_hint, season, source_urls")
          .eq("id", args.topic_id).eq("business_id", ctx.businessId).maybeSingle();
        if (topic) {
          artifacts.research = {
            content: JSON.stringify(topic, null, 2),
            created_at: new Date().toISOString(),
          };
        }
      }

      const { data: piece, error: pieceErr } = await t(ctx, "content_pieces")
        .insert({
          business_id: ctx.businessId, brand_id: args.brand_id,
          topic_id: args.topic_id ?? null, topic: args.topic,
          kind: args.kind as ContentKind, platforms,
          angle_count: args.angle_count ?? 3,
          artifacts, status: "running",
        })
        .select("id").single();
      if (pieceErr) throw pieceErr;

      const { data: job, error: jobErr } = await t(ctx, "content_jobs")
        .insert({
          business_id: ctx.businessId, brand_id: args.brand_id,
          type: "content_pipeline", status: "queued", step: 0,
          input: { content_piece_id: piece.id },
        })
        .select("id").single();
      if (jobErr) throw jobErr;

      await t(ctx, "content_pieces").update({ job_id: job.id }).eq("id", piece.id);
      if (args.topic_id) {
        await t(ctx, "content_topics").update({ status: "in_progress" }).eq("id", args.topic_id);
      }

      return text({ piece_id: piece.id, job_id: job.id, status: "queued" });
    });

  tool("list_social_pieces", "List generated pieces for a brand.",
    { brand_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:read");
      const { data, error } = await t(ctx, "content_pieces")
        .select("id, topic, kind, platforms, angle_count, current_stage, status, created_at")
        .eq("business_id", ctx.businessId).eq("brand_id", args.brand_id)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return text(data);
    });

  tool("list_social_variations",
    "Read the generated variations for a piece — the actual deliverable, one per angle per platform.",
    { piece_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:read");
      const { data, error } = await t(ctx, "content_variations")
        .select("id, angle, angle_index, platform, hook, body, assets, status, scheduled_at, posted_at")
        .eq("business_id", ctx.businessId).eq("piece_id", args.piece_id)
        .order("angle_index").limit(200);
      if (error) throw error;
      return text(data);
    });

  tool("set_social_variation_status", "Approve or reject one variation.",
    { variation_id: UUID, status: z.enum(["draft", "approved", "rejected"]) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:write");
      const { error } = await t(ctx, "content_variations")
        .update({ status: args.status })
        .eq("id", args.variation_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ ok: true });
    });

  tool("list_content_activity", "The agent activity log for a brand — what ran, what it cost, what failed.",
    { brand_id: UUID, limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:read");
      const { data, error } = await t(ctx, "content_job_events")
        .select("level, message, created_at")
        .eq("business_id", ctx.businessId).eq("brand_id", args.brand_id)
        .order("created_at", { ascending: false }).limit(args.limit ?? 80);
      if (error) throw error;
      return text((data ?? []).reverse());
    });

  // ── campaigns + the schedule ──────────────────────────────────────────────

  tool("list_content_campaigns", "List a brand's campaigns.",
    { brand_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:read");
      const { data, error } = await t(ctx, "content_campaigns")
        .select("*").eq("business_id", ctx.businessId).eq("brand_id", args.brand_id)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return text(data);
    });

  tool("create_content_campaign",
    "Create a campaign — a theme with a start date and a cadence to space its pieces across.",
    {
      brand_id: UUID,
      name: z.string().min(1),
      theme: z.string().optional(),
      goal: z.string().optional(),
      starts_on: DATE.optional(),
      cadence: CADENCE.optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:write");
      const { data, error } = await t(ctx, "content_campaigns")
        .insert({
          business_id: ctx.businessId, brand_id: args.brand_id, name: args.name,
          theme: args.theme ?? null, goal: args.goal ?? null,
          starts_on: args.starts_on ?? null, cadence: args.cadence ?? null,
        })
        .select("id, name").single();
      if (error) throw error;
      return text(data);
    });

  tool("update_content_campaign", "Update a campaign. Only the fields you pass change.",
    {
      campaign_id: UUID,
      name: z.string().optional(),
      theme: z.string().optional(),
      goal: z.string().optional(),
      starts_on: DATE.optional(),
      cadence: CADENCE.optional(),
      status: z.enum(["draft", "active", "done", "archived"]).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:write");
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "theme", "goal", "starts_on", "cadence", "status"] as const) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      if (Object.keys(patch).length === 0) return errorText("Nothing to update");
      const { error } = await t(ctx, "content_campaigns")
        .update(patch).eq("id", args.campaign_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ ok: true });
    });

  tool("delete_content_campaign", "Delete a campaign. Its pieces survive — they just lose the grouping.",
    { campaign_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:write");
      const { error } = await t(ctx, "content_campaigns")
        .delete().eq("id", args.campaign_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ ok: true });
    });

  tool("plan_content_campaign",
    "Fan a campaign into one piece per topic, spaced by its cadence from its start date. Highest-priority topics go out first. Each piece is queued to the pipeline immediately.",
    {
      campaign_id: UUID,
      topic_ids: z.array(UUID).min(1),
      kind: z.enum(["script", "post", "hooks"]),
      platforms: z.array(z.enum(["instagram", "facebook", "tiktok", "linkedin", "youtube"])).optional(),
      angle_count: z.number().int().min(1).max(6).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:write");

      const { data: campaign } = await t(ctx, "content_campaigns")
        .select("*").eq("id", args.campaign_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!campaign) return errorText("Campaign not found");
      if (!campaign.starts_on) return errorText("Give the campaign a start date before planning it.");

      const platforms = validPlatforms(args.platforms ?? []);
      if (args.kind !== "hooks" && platforms.length === 0) return errorText("Pick at least one platform.");

      const budget = await spendStatus(ctx.sb, ctx.businessId);
      if (!budget.ok) return errorText("This month's content budget is used up.");

      const { data: topics } = await t(ctx, "content_topics")
        .select("id, title, detail, angle_hint, season, source_urls, priority")
        .eq("business_id", ctx.businessId).in("id", args.topic_ids);
      if (!topics?.length) return errorText("Those topics don't exist.");

      // Best material first, not whatever order the ids arrived in.
      const ordered = [...topics].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      const dates = planDates(campaign.starts_on, campaign.cadence, ordered.length);
      const now = new Date().toISOString();
      const queued: Array<{ piece_id: string; topic: string; publish_on: string }> = [];

      for (const [i, topic] of ordered.entries()) {
        const { data: piece, error: pErr } = await t(ctx, "content_pieces")
          .insert({
            business_id: ctx.businessId, brand_id: campaign.brand_id,
            campaign_id: campaign.id, topic_id: topic.id, topic: topic.title,
            kind: args.kind as ContentKind, platforms,
            angle_count: args.angle_count ?? 3,
            publish_on: dates[i],
            artifacts: { research: { content: JSON.stringify(topic, null, 2), created_at: now } },
            status: "running",
          })
          .select("id").single();
        if (pErr) throw pErr;

        const { data: job, error: jErr } = await t(ctx, "content_jobs")
          .insert({
            business_id: ctx.businessId, brand_id: campaign.brand_id,
            type: "content_pipeline", status: "queued", step: 0,
            input: { content_piece_id: piece.id },
          })
          .select("id").single();
        if (jErr) throw jErr;

        await t(ctx, "content_pieces").update({ job_id: job.id }).eq("id", piece.id);
        await t(ctx, "content_topics").update({ status: "in_progress" }).eq("id", topic.id);
        queued.push({ piece_id: piece.id, topic: topic.title, publish_on: dates[i] });
      }

      await t(ctx, "content_campaigns").update({ status: "active" }).eq("id", campaign.id);
      return text({ queued: queued.length, pieces: queued });
    });

  tool("list_content_calendar",
    "Everything scheduled for a brand in a date window, with what it is and whether it's been posted.",
    { brand_id: UUID, from_date: DATE, to_date: DATE },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:read");
      const { data, error } = await t(ctx, "content_variations")
        .select("id, angle, platform, hook, status, scheduled_at, posted_at, external_url, content_pieces!inner(topic, kind, brand_id)")
        .eq("business_id", ctx.businessId)
        .eq("content_pieces.brand_id", args.brand_id)
        .not("scheduled_at", "is", null)
        .gte("scheduled_at", `${args.from_date}T00:00:00Z`)
        .lte("scheduled_at", `${args.to_date}T23:59:59Z`)
        .order("scheduled_at", { ascending: true }).limit(500);
      if (error) throw error;
      return text(data);
    });

  tool("schedule_social_variation", "Set (or clear) when a variation should go out.",
    {
      variation_id: UUID,
      scheduled_at: z.string().optional().describe("ISO 8601 timestamp. Omit to unschedule."),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:write");

      let when: string | null = null;
      if (args.scheduled_at) {
        const d = new Date(args.scheduled_at);
        if (Number.isNaN(d.getTime())) return errorText("That's not a valid timestamp.");
        when = d.toISOString();
      }

      const { error } = await t(ctx, "content_variations")
        .update({ scheduled_at: when })
        .eq("id", args.variation_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ ok: true, scheduled_at: when });
    });

  tool("mark_social_variation_posted",
    "Record that a variation was posted. This is the manual publish path — there is no auto-poster yet, so this does NOT post anything to any platform.",
    { variation_id: UUID, external_url: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:write");
      const { error } = await t(ctx, "content_variations")
        .update({
          status: "posted",
          posted_at: new Date().toISOString(),
          external_url: args.external_url ?? null,
        })
        .eq("id", args.variation_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ ok: true });
    });

  tool("get_content_budget", "This month's content spend against the cap.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:read");
      const s = await spendStatus(ctx.sb, ctx.businessId);
      return text({ spent_cents: s.spentCents, budget_cents: s.budgetCents, ok: s.ok });
    });

  tool("set_content_budget", "Set the monthly content generation cap, in cents.",
    { budget_cents: z.number().int().min(0).describe("0 disables generation entirely") },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "content:write");
      const { error } = await t(ctx, "businesses")
        .update({ content_monthly_budget_cents: args.budget_cents })
        .eq("id", ctx.businessId);
      if (error) throw error;
      return text({ ok: true, budget_cents: args.budget_cents });
    });
}
