/**
 * MCP tools for the Materials plugin — a per-business catalog of materials with
 * COST prices (an internal cost reference, distinct from products/retail).
 * Scopes: materials:read / materials:write.
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";

export function registerMaterialTools(tool: ToolFn): void {
  tool("list_materials", "List materials in the cost catalog (name, cost price, unit, supplier). Optional name search.",
    { search: z.string().optional(), include_archived: z.boolean().optional(), limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "materials:read");
      let q = t(ctx, "materials")
        .select("id, name, description, sku, supplier, cost_price, sell_price, tax_rate, unit, archived")
        .eq("business_id", ctx.businessId).order("name").limit(args.limit ?? 100);
      if (!args.include_archived) q = q.eq("archived", false);
      if (args.search) q = q.ilike("name", `%${args.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("create_material", "Add a material to the catalog. cost_price is what YOU pay (base cost); sell_price is what you charge when quoting.",
    {
      name: z.string().min(1),
      cost_price: z.number(),
      sell_price: z.number().optional(),
      tax_rate: z.number().optional(),
      description: z.string().optional(),
      sku: z.string().optional(),
      supplier: z.string().optional(),
      unit: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "materials:write");
      const { data, error } = await t(ctx, "materials").insert({
        business_id: ctx.businessId, user_id: ctx.userId,
        name: args.name, cost_price: args.cost_price, sell_price: args.sell_price ?? args.cost_price, tax_rate: args.tax_rate ?? 20,
        description: args.description ?? null, sku: args.sku ?? null, supplier: args.supplier ?? null,
        unit: args.unit ?? null, archived: false,
      }).select().single();
      if (error) throw error;
      return text({ created: true, material: data });
    });

  tool("update_material", "Update a material in the catalog. Only provided fields change. cost_price = base cost you pay; sell_price = what you charge when quoting.",
    {
      material_id: UUID,
      name: z.string().optional(),
      cost_price: z.number().optional(),
      sell_price: z.number().optional(),
      tax_rate: z.number().optional(),
      description: z.string().optional(),
      sku: z.string().optional(),
      supplier: z.string().optional(),
      unit: z.string().optional(),
      archived: z.boolean().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "materials:write");
      const { material_id, ...patch } = args;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { data, error } = await t(ctx, "materials")
        .update(clean).eq("id", material_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, material: data });
    });

  tool("delete_material", "Delete a material from the cost catalog.",
    { material_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "materials:write");
      const { error } = await t(ctx, "materials").delete().eq("id", args.material_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });
}
