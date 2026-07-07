/**
 * MCP tools for the SEO Production plugin (docs/SEO_AGENCY_PLAN.md, Phase 2).
 * First slice = client-site CRUD; connectors / opportunities / content pipeline
 * tools land alongside those features. Scopes: seo:read / seo:write.
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";

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
}
