/**
 * MCP tools for the SEO Production plugin (docs/SEO_AGENCY_PLAN.md, Phase 2).
 * First slice = client-site CRUD; connectors / opportunities / content pipeline
 * tools land alongside those features. Scopes: seo:read / seo:write.
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";
import { advanceContentJob, seoSpendStatus } from "@/lib/seo/engine";

const DOMAIN = z.string().min(1).describe("Client site domain, e.g. example.com");

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "")
    .split("/")[0].split("?")[0].replace(/\/+$/, "");
}

export function registerSeoTools(tool: ToolFn): void {
  tool("list_seo_sites", "List the client sites this business manages for SEO.",
    { status: z.enum(["active", "paused", "archived"]).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:read");
      let q = t(ctx, "seo_sites")
        .select("id, domain, platform, playbook, status, customer_id, created_at")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(200);
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("get_seo_site", "Get one client SEO site including its notes.",
    { site_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:read");
      const { data } = await t(ctx, "seo_sites")
        .select("*, customers(name, email)").eq("id", args.site_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return errorText("Site not found");
      return text(data);
    });

  tool("create_seo_site",
    "Register a client site for SEO work. platform = wordpress|shopify|other; playbook = local|ecommerce. Link it to a customer with customer_id (the agency's client).",
    {
      domain: DOMAIN,
      customer_id: UUID.optional(),
      platform: z.enum(["wordpress", "shopify", "other"]).optional(),
      playbook: z.enum(["local", "ecommerce"]).optional(),
      notes: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:write");
      const domain = normalizeDomain(args.domain);
      if (!domain) return errorText("A domain is required");
      const { data, error } = await t(ctx, "seo_sites").insert({
        business_id: ctx.businessId,
        customer_id: args.customer_id ?? null,
        domain,
        platform: args.platform ?? "other",
        playbook: args.playbook ?? "local",
        notes: args.notes?.trim() || null,
      }).select("id, domain, platform, playbook, status").single();
      if (error) throw error;
      return text({ created: true, site: data });
    });

  tool("update_seo_site", "Update a client site's domain / platform / playbook / status / notes.",
    {
      site_id: UUID,
      domain: DOMAIN.optional(),
      customer_id: UUID.optional(),
      platform: z.enum(["wordpress", "shopify", "other"]).optional(),
      playbook: z.enum(["local", "ecommerce"]).optional(),
      status: z.enum(["active", "paused", "archived"]).optional(),
      notes: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:write");
      const { site_id, domain, ...rest } = args;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clean: Record<string, any> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (domain !== undefined) clean.domain = normalizeDomain(domain);
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { error } = await t(ctx, "seo_sites").update(clean).eq("id", site_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("delete_seo_site", "Delete a client site and all its SEO data (connections, snapshots, content).",
    { site_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:write");
      const { error } = await t(ctx, "seo_sites").delete().eq("id", args.site_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  // ── Content pipeline ────────────────────────────────────────────────────────
  tool("start_content_pipeline",
    "Kick off the SEO content pipeline for a client site: creates a content piece and queues the agent chain (keyword research → SERP → brief → draft → voice → humanize → optimize → edit). content_type = blog | landing | email | social.",
    {
      site_id: UUID,
      topic: z.string().min(1),
      content_type: z.enum(["blog", "landing", "email", "social"]).optional(),
      title: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:write");
      const contentType = args.content_type ?? "blog";
      const { data: piece, error } = await t(ctx, "seo_content_pieces").insert({
        business_id: ctx.businessId, site_id: args.site_id,
        title: args.title?.trim() || args.topic.trim(), topic: args.topic.trim(),
        content_type: contentType, status: "brief", pipeline_status: "running", artifacts: {},
      }).select("id").single();
      if (error) throw error;
      const { data: job, error: jErr } = await t(ctx, "seo_jobs").insert({
        business_id: ctx.businessId, site_id: args.site_id, type: "content_pipeline",
        status: "queued", step: 0, input: { content_piece_id: piece.id },
      }).select("id").single();
      if (jErr) throw jErr;
      await t(ctx, "seo_content_pieces").update({ job_id: job.id }).eq("id", piece.id);
      await t(ctx, "seo_job_events").insert({
        business_id: ctx.businessId, site_id: args.site_id, job_id: job.id, level: "info",
        message: `Queued "${args.topic.trim()}" (${contentType})`,
      });
      return text({ started: true, piece_id: piece.id, note: "The cron advances it, or call advance_content_pipeline to run the next step now." });
    });

  tool("advance_content_pipeline", "Run the next agent step for a content piece now (one step per call). Returns the new status/stage.",
    { piece_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:write");
      const { data: piece } = await t(ctx, "seo_content_pieces")
        .select("id, job_id").eq("id", args.piece_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!piece?.job_id) return errorText("No pipeline job for this piece");
      const { data: job } = await t(ctx, "seo_jobs").select("*").eq("id", piece.job_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!job) return errorText("Job not found");
      if (job.status === "awaiting_approval" || job.status === "done") return text({ status: job.status });
      const result = await advanceContentJob(ctx.sb, job);
      return text(result);
    });

  tool("list_content_pieces", "List content pieces (articles/pages) and their pipeline status for this business or one site.",
    { site_id: UUID.optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:read");
      let q = t(ctx, "seo_content_pieces")
        .select("id, site_id, title, topic, content_type, status, pipeline_status, current_stage, created_at")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(200);
      if (args.site_id) q = q.eq("site_id", args.site_id);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("get_content_piece", "Get a content piece including every agent artifact produced so far (keyword research, brief, draft, final, …).",
    { piece_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:read");
      const { data } = await t(ctx, "seo_content_pieces").select("*").eq("id", args.piece_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return errorText("Content piece not found");
      return text(data);
    });

  tool("approve_content_piece", "Approve a finished content piece (past the edit gate) — marks it done and ready to publish.",
    { piece_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:write");
      const { data: piece } = await t(ctx, "seo_content_pieces").select("id, job_id").eq("id", args.piece_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!piece) return errorText("Piece not found");
      await t(ctx, "seo_content_pieces").update({ pipeline_status: "done", status: "approved" }).eq("id", args.piece_id);
      if (piece.job_id) await t(ctx, "seo_jobs").update({ status: "done" }).eq("id", piece.job_id);
      return text({ approved: true });
    });

  // ── Budget cap ──────────────────────────────────────────────────────────────
  tool("get_seo_budget", "Get this month's SEO agent spend vs. the monthly budget cap (cents).",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:read");
      return text(await seoSpendStatus(ctx.sb, ctx.businessId));
    });

  tool("set_seo_budget", "Set the monthly SEO agent budget cap in cents (0 = unlimited). The engine stops running agents once the month's spend reaches it.",
    { cents: z.number().int().min(0) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:write");
      const { error } = await t(ctx, "businesses").update({ seo_monthly_budget_cents: args.cents }).eq("id", ctx.businessId);
      if (error) throw error;
      return text({ budget_cents: args.cents });
    });

  tool("list_seo_activity", "Read the agent activity log for a site (chronological) — what the agents have been doing.",
    { site_id: UUID, limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "seo:read");
      const { data, error } = await t(ctx, "seo_job_events")
        .select("agent_id, level, message, cost_cents, created_at")
        .eq("business_id", ctx.businessId).eq("site_id", args.site_id)
        .order("created_at", { ascending: false }).limit(args.limit ?? 80);
      if (error) throw error;
      return text((data ?? []).reverse());
    });
}
