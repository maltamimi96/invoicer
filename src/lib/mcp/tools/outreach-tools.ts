/**
 * MCP tools for the Outreach agent. Scopes: outreach:read / outreach:write.
 *
 * These run as service-role via the admin client scoped by business_id (the
 * MCP layer is API-key authed, so the cookie-bound server actions can't be
 * reused). The engine itself is shared with the cron + the UI, so a send
 * triggered from here obeys exactly the same caps, window and suppression list.
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";
import { autoEnroll, runOutreachForBusiness, stopEnrollments } from "@/lib/outreach/engine";
import { sourceProspects } from "@/lib/outreach/sourcing";
import { SEED_SEQUENCES, SEEDS_BY_VERTICAL } from "@/lib/outreach/seed-sequences";

const STEP = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  delay_days: z.number().int().min(0).default(0),
});

export function registerOutreachTools(tool: ToolFn): void {
  // ── Settings ───────────────────────────────────────────────────────────────

  tool("get_outreach_settings",
    "Outreach agent configuration: whether sending is on, the daily cap, send window/days, timezone, from address and sourcing setup. Never returns the stored API key.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:read");
      const { data } = await t(ctx, "outreach_settings").select("*").eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return text({ enabled: false, configured: false });
      const { places_api_key_enc, ...safe } = data;
      return text({ ...safe, places_api_key_set: Boolean(places_api_key_enc) });
    });

  tool("update_outreach_settings",
    "Change outreach sending guardrails. Setting enabled=false stops all sending immediately.",
    {
      enabled: z.boolean().optional(),
      daily_send_cap: z.number().int().min(0).max(1000).optional(),
      send_window_start: z.string().optional(),
      send_window_end: z.string().optional(),
      send_days: z.array(z.number().int().min(0).max(6)).optional(),
      seconds_between_sends: z.number().int().min(0).max(600).optional(),
      timezone: z.string().optional(),
      from_local_part: z.string().optional(),
      reply_to: z.string().optional(),
      signature_html: z.string().optional(),
      sourcing_enabled: z.boolean().optional(),
      sourcing_queries: z.array(z.string()).optional(),
      sourcing_daily_quota: z.number().int().min(0).max(500).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:write");
      const patch = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      if (!Object.keys(patch).length) return errorText("Nothing to update");
      const { error } = await t(ctx, "outreach_settings")
        .upsert({ business_id: ctx.businessId, ...patch }, { onConflict: "business_id" });
      if (error) throw error;
      return text({ updated: true, ...patch });
    });

  // ── Sequences ──────────────────────────────────────────────────────────────

  tool("list_outreach_sequences", "List outreach sequences with their step counts.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:read");
      const { data, error } = await t(ctx, "outreach_sequences")
        .select("id, name, description, vertical, status, created_at, outreach_sequence_steps(count)")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return text(((data ?? []) as any[]).map((s) => ({
        id: s.id, name: s.name, description: s.description, vertical: s.vertical,
        status: s.status, steps: s.outreach_sequence_steps?.[0]?.count ?? 0,
      })));
    });

  tool("get_outreach_sequence", "Get a sequence with every step's subject, body and delay.",
    { sequence_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:read");
      const { data: seq } = await t(ctx, "outreach_sequences").select("*")
        .eq("id", args.sequence_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!seq) return errorText("Sequence not found");
      const { data: steps } = await t(ctx, "outreach_sequence_steps")
        .select("step_order, delay_days, subject, body").eq("sequence_id", args.sequence_id).order("step_order");
      return text({ ...seq, steps: steps ?? [] });
    });

  tool("list_outreach_templates",
    "The built-in seed sequence library — 11 verticals (strata, real estate, builders, NDIS, facilities, insurance, housing, aged care, schools, hospitality, trade partners), each a 4-step arc over two weeks. Use create_outreach_sequence with template=<vertical> to start from one.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:read");
      return text(SEED_SEQUENCES.map((s) => ({
        vertical: s.vertical, name: s.name, description: s.description, steps: s.steps.length,
      })));
    });

  tool("create_outreach_sequence",
    "Create a sequence. Pass `template` to copy a seed vertical, or `steps` to write your own. Merge fields: {{first_name}} {{name}} {{company}} {{title}} {{website}}. Bodies are plain text.",
    {
      name: z.string().optional(),
      description: z.string().optional(),
      template: z.string().optional(),
      steps: z.array(STEP).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:write");

      const seed = args.template ? SEEDS_BY_VERTICAL[args.template] : undefined;
      if (args.template && !seed) {
        return errorText(`Unknown template "${args.template}". Call list_outreach_templates for valid verticals.`);
      }
      const steps = args.steps?.length ? args.steps : seed?.steps;
      if (!steps?.length) return errorText("Provide either a template or at least one step");

      const name = args.name?.trim() || seed?.name;
      if (!name) return errorText("A sequence name is required");

      const { data: seq, error } = await t(ctx, "outreach_sequences").insert({
        business_id: ctx.businessId, name,
        description: args.description ?? seed?.description ?? null,
        vertical: seed?.vertical ?? null, status: "draft",
      }).select("id").single();
      if (error) throw error;

      const rows = steps.map((s: z.infer<typeof STEP>, i: number) => ({
        business_id: ctx.businessId, sequence_id: seq.id, step_order: i + 1,
        delay_days: i === 0 ? 0 : (s.delay_days ?? 0), subject: s.subject, body: s.body,
      }));
      const { error: stepErr } = await t(ctx, "outreach_sequence_steps").insert(rows);
      if (stepErr) {
        await t(ctx, "outreach_sequences").delete().eq("id", seq.id);
        throw stepErr;
      }
      return text({ created: true, sequence_id: seq.id, steps: rows.length });
    });

  tool("update_outreach_sequence_steps",
    "Replace a sequence's steps wholesale. Step 1 always sends immediately on enrolment, so its delay is forced to 0.",
    { sequence_id: UUID, steps: z.array(STEP) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:write");
      const { data: owned } = await t(ctx, "outreach_sequences").select("id")
        .eq("id", args.sequence_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!owned) return errorText("Sequence not found");

      await t(ctx, "outreach_sequence_steps").delete()
        .eq("sequence_id", args.sequence_id).eq("business_id", ctx.businessId);
      if (!args.steps.length) return text({ updated: true, steps: 0 });

      const rows = args.steps.map((s: z.infer<typeof STEP>, i: number) => ({
        business_id: ctx.businessId, sequence_id: args.sequence_id, step_order: i + 1,
        delay_days: i === 0 ? 0 : (s.delay_days ?? 0), subject: s.subject, body: s.body,
      }));
      const { error } = await t(ctx, "outreach_sequence_steps").insert(rows);
      if (error) throw error;
      return text({ updated: true, steps: rows.length });
    });

  tool("delete_outreach_sequence", "Delete a sequence and its steps.",
    { sequence_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:write");
      const { error } = await t(ctx, "outreach_sequences").delete()
        .eq("id", args.sequence_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  // ── Campaigns ──────────────────────────────────────────────────────────────

  tool("list_outreach_campaigns", "List outreach campaigns with status and enrolment filter.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:read");
      const { data, error } = await t(ctx, "outreach_campaigns").select("*")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false });
      if (error) throw error;
      return text(data);
    });

  tool("create_outreach_campaign",
    "Create a campaign — a sequence pointed at the prospects matching a filter. Starts as a draft; nothing sends until you set it running.",
    {
      name: z.string().min(1),
      sequence_id: UUID,
      tags: z.array(z.string()).optional(),
      statuses: z.array(z.string()).optional(),
      sources: z.array(z.string()).optional(),
      auto_enroll: z.boolean().optional(),
      daily_cap: z.number().int().min(0).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:write");
      const { data, error } = await t(ctx, "outreach_campaigns").insert({
        business_id: ctx.businessId, name: args.name, sequence_id: args.sequence_id,
        filter: { tags: args.tags ?? [], status: args.statuses ?? [], sources: args.sources ?? [] },
        auto_enroll: args.auto_enroll ?? true, daily_cap: args.daily_cap ?? null,
      }).select("id").single();
      if (error) throw error;
      return text({ created: true, campaign_id: data.id, status: "draft" });
    });

  tool("set_outreach_campaign_status",
    "Start, pause or complete a campaign. 'running' is what actually lets its enrollments send.",
    { campaign_id: UUID, status: z.enum(["draft", "running", "paused", "completed"]) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:write");
      const patch: Record<string, unknown> = { status: args.status };
      if (args.status === "running") patch.started_at = new Date().toISOString();
      const { error } = await t(ctx, "outreach_campaigns").update(patch)
        .eq("id", args.campaign_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true, status: args.status });
    });

  tool("delete_outreach_campaign", "Delete a campaign and its enrollments.",
    { campaign_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:write");
      const { error } = await t(ctx, "outreach_campaigns").delete()
        .eq("id", args.campaign_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("enroll_outreach_prospects",
    "Enrol every prospect matching a campaign's filter that isn't already in it. Returns how many were added.",
    { campaign_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:write");
      const n = await autoEnroll(ctx.sb, ctx.businessId, args.campaign_id);
      return text({ enrolled: n });
    });

  tool("stop_outreach_for_prospect",
    "Stop every active sequence for one prospect — use when they reply, ask to stop, or you learn the address is wrong.",
    { prospect_id: UUID, replied: z.boolean().optional(), reason: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:write");
      await stopEnrollments(
        ctx.sb, ctx.businessId, args.prospect_id,
        args.replied ? "replied" : "stopped", args.reason,
      );
      if (args.replied) {
        await t(ctx, "prospects").update({ status: "responded" })
          .eq("id", args.prospect_id).eq("business_id", ctx.businessId);
      }
      return text({ stopped: true });
    });

  // ── Tracking + running ─────────────────────────────────────────────────────

  tool("get_outreach_stats",
    "Delivery funnel for the outreach agent: sent, delivered, opened, clicked, bounced, replied, plus how many prospects still have a step due.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:read");
      const [msgs, enr] = await Promise.all([
        t(ctx, "outreach_messages").select("status, opened_at, clicked_at, replied_at, bounced_at")
          .eq("business_id", ctx.businessId).limit(10000),
        t(ctx, "outreach_enrollments").select("id", { count: "exact", head: true })
          .eq("business_id", ctx.businessId).eq("status", "active"),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (msgs.data ?? []) as any[];
      return text({
        sent: rows.length,
        delivered: rows.filter((r) => r.delivered_at || ["delivered", "opened", "clicked"].includes(r.status)).length,
        opened: rows.filter((r) => r.opened_at).length,
        clicked: rows.filter((r) => r.clicked_at).length,
        bounced: rows.filter((r) => r.bounced_at || r.status === "bounced").length,
        replied: rows.filter((r) => r.replied_at).length,
        active_enrollments: enr.count ?? 0,
      });
    });

  tool("list_outreach_messages", "Recent outreach emails with their delivery/open/click/bounce state.",
    { campaign_id: UUID.optional(), limit: z.number().int().min(1).max(500).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:read");
      let q = t(ctx, "outreach_messages")
        .select("id, recipient, subject, step_order, status, sent_at, delivered_at, opened_at, clicked_at, bounced_at")
        .eq("business_id", ctx.businessId).order("sent_at", { ascending: false }).limit(args.limit ?? 100);
      if (args.campaign_id) q = q.eq("campaign_id", args.campaign_id);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("run_outreach_now",
    "Send whatever is due right now, ignoring the send window (the daily cap and suppression list still apply). Requires sending to be enabled.",
    { limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:write");
      const res = await runOutreachForBusiness(ctx.sb, ctx.businessId, {
        ignoreWindow: true, limit: args.limit ?? 25,
      });
      return text({ sent: res.sent, skipped: res.skipped, failed: res.failed, completed: res.completed });
    });

  tool("source_prospects",
    "Run a Google Places sourcing pass using the business's configured search terms, locations and its own API key. Places doesn't return email addresses, so new prospects arrive with a website and no email.",
    { limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "outreach:write");
      const res = await sourceProspects(ctx.sb, ctx.businessId, { limit: args.limit });
      if (res.errors.length && !res.created) return errorText(res.errors[0]);
      return text(res);
    });
}
