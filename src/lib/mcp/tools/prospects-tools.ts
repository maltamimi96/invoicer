/**
 * MCP tools for the Prospects plugin. Scopes: prospects:read / prospects:write
 * (convert also needs leads:write). Bulk + outreach tools land with those PRs.
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";

const STATUS = z.enum(["new", "contacted", "responded", "qualified", "unqualified", "converted"]);
const PFIELDS = {
  name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(),
  company: z.string().optional(), title: z.string().optional(), website: z.string().optional(),
  source: z.string().optional(), status: STATUS.optional(), tags: z.array(z.string()).optional(), notes: z.string().optional(),
};
const clean = (v?: string) => (v?.trim() ? v.trim() : null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function row(businessId: string, userId: string, p: any) {
  return {
    business_id: businessId, user_id: userId, name: clean(p.name), email: clean(p.email)?.toLowerCase() ?? null,
    phone: clean(p.phone), company: clean(p.company), title: clean(p.title), website: clean(p.website),
    source: clean(p.source) ?? "import", status: p.status ?? "new", tags: p.tags ?? [], notes: clean(p.notes), custom_fields: p.custom_fields ?? {},
  };
}

export function registerProspectTools(tool: ToolFn): void {
  tool("list_prospects", "List prospects (cold outreach list). Filter by status / tag / free-text search.",
    { status: STATUS.optional(), search: z.string().optional(), tag: z.string().optional(), limit: z.number().int().min(1).max(500).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:read");
      let q = t(ctx, "prospects").select("id, name, email, company, phone, source, status, tags, last_contacted_at, lead_id, created_at")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(args.limit ?? 200);
      if (args.status) q = q.eq("status", args.status);
      if (args.tag) q = q.contains("tags", [args.tag]);
      if (args.search?.trim()) { const s = `%${args.search.trim()}%`; q = q.or(`name.ilike.${s},email.ilike.${s},company.ilike.${s}`); }
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("get_prospect", "Get one prospect with all fields.",
    { prospect_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:read");
      const { data } = await t(ctx, "prospects").select("*").eq("id", args.prospect_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return errorText("Prospect not found");
      return text(data);
    });

  tool("create_prospect", "Add a prospect to the cold list.",
    PFIELDS,
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write");
      const { data, error } = await t(ctx, "prospects").insert({ ...row(ctx.businessId, ctx.userId, args), source: clean(args.source) ?? "manual" }).select("id").single();
      if (error) return errorText(String(error.message ?? "").includes("idx_prospects_biz_email") ? "A prospect with that email already exists." : String(error.message));
      return text({ created: true, prospect_id: data.id });
    });

  tool("import_prospects", "Bulk-import prospects (deduped by email — existing emails are skipped). Great for CSV/list ingestion.",
    { prospects: z.array(z.object(PFIELDS)).min(1).max(1000) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write");
      const { data: existing } = await t(ctx, "prospects").select("email").eq("business_id", ctx.businessId).not("email", "is", null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seen = new Set(((existing ?? []) as any[]).map((r) => String(r.email).toLowerCase()));
      const toInsert: unknown[] = []; let skipped = 0;
      for (const p of args.prospects) {
        const r = row(ctx.businessId, ctx.userId, p);
        if (r.email && seen.has(r.email)) { skipped++; continue; }
        if (r.email) seen.add(r.email);
        toInsert.push(r);
      }
      if (toInsert.length) { const { error } = await t(ctx, "prospects").insert(toInsert); if (error) throw error; }
      return text({ imported: toInsert.length, skipped });
    });

  tool("update_prospect", "Update a prospect's fields or status.",
    { prospect_id: UUID, ...PFIELDS },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write");
      const { prospect_id, ...rest } = args;
      const c = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if ("email" in c && typeof c.email === "string") c.email = c.email.toLowerCase();
      if (Object.keys(c).length === 0) return errorText("No fields to update.");
      const { error } = await t(ctx, "prospects").update(c).eq("id", prospect_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("delete_prospect", "Delete a prospect.",
    { prospect_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write");
      const { error } = await t(ctx, "prospects").delete().eq("id", args.prospect_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("convert_prospect", "Convert a prospect into a Lead (deduped) and mark it converted.",
    { prospect_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "prospects:write"); assertScope(ctx, "leads:write");
      const { data: p } = await t(ctx, "prospects").select("*").eq("id", args.prospect_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!p) return errorText("Prospect not found");
      const { data: biz } = await t(ctx, "businesses").select("user_id").eq("id", ctx.businessId).maybeSingle();
      const { data: lead, error } = await ctx.sb.rpc("upsert_lead", {
        p_business_id: ctx.businessId, p_user_id: biz?.user_id, p_name: p.name || p.email || "Prospect",
        p_email: p.email, p_phone: p.phone, p_address: null, p_suburb: null, p_service: null,
        p_property_type: null, p_timing: null, p_notes: `Converted from prospect${p.company ? ` (${p.company})` : ""}`, p_source: "prospect", p_source_ref: args.prospect_id,
      }).single();
      if (error) throw error;
      await t(ctx, "prospects").update({ status: "converted", lead_id: lead?.id ?? null }).eq("id", args.prospect_id).eq("business_id", ctx.businessId);
      return text({ converted: true, lead_id: lead?.id ?? null });
    });
}
