/**
 * MCP tools for the Assets & equipment plugin. Scopes: assets:read /
 * assets:write.
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";

export function registerAssetTools(tool: ToolFn): void {
  tool("list_assets", "List tools/vehicles/equipment (optionally only those due for service soon).",
    { due_soon: z.boolean().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "assets:read");
      const { data, error } = await t(ctx, "assets")
        .select("id, name, category, identifier, status, assigned_to, next_service_on")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows = (data ?? []) as any[];
      if (args.due_soon) {
        const cutoff = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
        rows = rows.filter((a) => a.status !== "retired" && a.next_service_on != null && a.next_service_on <= cutoff);
      }
      return text(rows);
    });

  tool("create_asset", "Add a tool/vehicle/equipment. category = tool | vehicle | equipment | other.",
    { name: z.string().min(1), category: z.enum(["tool", "vehicle", "equipment", "other"]).optional(), identifier: z.string().optional(), assigned_to: UUID.optional(), purchase_date: z.string().optional(), purchase_cost: z.number().optional(), next_service_on: z.string().optional(), notes: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "assets:write");
      const { data, error } = await t(ctx, "assets").insert({
        business_id: ctx.businessId, name: args.name.trim(), category: args.category ?? "tool",
        identifier: args.identifier?.trim() || null, assigned_to: args.assigned_to ?? null,
        purchase_date: args.purchase_date || null, purchase_cost: args.purchase_cost ?? null,
        next_service_on: args.next_service_on || null, notes: args.notes?.trim() || null,
      }).select("id").single();
      if (error) throw error;
      return text({ created: true, asset_id: data.id });
    });

  tool("update_asset", "Update an asset (status / assignment / next service / details).",
    { asset_id: UUID, name: z.string().optional(), category: z.enum(["tool", "vehicle", "equipment", "other"]).optional(), identifier: z.string().nullable().optional(), status: z.enum(["active", "in_repair", "retired"]).optional(), assigned_to: UUID.nullable().optional(), next_service_on: z.string().nullable().optional(), notes: z.string().nullable().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "assets:write");
      const { asset_id, ...rest } = args;
      const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { error } = await t(ctx, "assets").update(clean).eq("id", asset_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("delete_asset", "Delete an asset and its service history.",
    { asset_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "assets:write");
      const { error } = await t(ctx, "assets").delete().eq("id", args.asset_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("log_asset_service", "Log a service on an asset; next_due advances its next-service date.",
    { asset_id: UUID, serviced_on: z.string().optional(), description: z.string().optional(), cost: z.number().optional(), next_due: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "assets:write");
      const { error } = await t(ctx, "asset_service_logs").insert({
        business_id: ctx.businessId, asset_id: args.asset_id,
        serviced_on: args.serviced_on || new Date().toISOString().split("T")[0],
        description: args.description?.trim() || null, cost: args.cost ?? null,
        next_due: args.next_due || null, created_by: ctx.userId,
      });
      if (error) throw error;
      if (args.next_due) await t(ctx, "assets").update({ next_service_on: args.next_due }).eq("id", args.asset_id).eq("business_id", ctx.businessId);
      return text({ logged: true });
    });
}
