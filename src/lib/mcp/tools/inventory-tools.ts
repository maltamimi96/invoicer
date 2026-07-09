/**
 * MCP tools for the Inventory & stock plugin. Reuses the products:read/write
 * scope (inventory extends products).
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";

export function registerInventoryTools(tool: ToolFn): void {
  tool("list_inventory", "List tracked stock items with on-hand quantities and reorder points.",
    { low_only: z.boolean().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "products:read");
      const { data, error } = await t(ctx, "products")
        .select("id, name, unit, stock_qty, reorder_point, unit_cost")
        .eq("business_id", ctx.businessId).eq("track_stock", true).eq("archived", false).order("name");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows = (data ?? []) as any[];
      if (args.low_only) rows = rows.filter((p) => p.reorder_point != null && Number(p.stock_qty) <= Number(p.reorder_point));
      return text(rows);
    });

  tool("create_stock_item", "Create a tracked stock item (a product with stock tracking on).",
    { name: z.string().min(1), unit: z.string().optional(), stock_qty: z.number().optional(), reorder_point: z.number().optional(), unit_cost: z.number().optional(), unit_price: z.number().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "products:write");
      const { data, error } = await t(ctx, "products").insert({
        business_id: ctx.businessId, user_id: ctx.userId, name: args.name.trim(),
        unit: args.unit?.trim() || null, unit_price: args.unit_price ?? 0, tax_rate: 0,
        track_stock: true, stock_qty: args.stock_qty ?? 0,
        reorder_point: args.reorder_point ?? null, unit_cost: args.unit_cost ?? null,
      }).select("id").single();
      if (error) throw error;
      return text({ created: true, product_id: data.id });
    });

  tool("set_stock_tracking", "Turn stock tracking on/off for a product and set its levels.",
    { product_id: UUID, track_stock: z.boolean().optional(), stock_qty: z.number().optional(), reorder_point: z.number().nullable().optional(), unit_cost: z.number().nullable().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "products:write");
      const { product_id, ...rest } = args;
      const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { error } = await t(ctx, "products").update(clean).eq("id", product_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("adjust_stock", "Record a stock movement (delta) and update on-hand. reason = received | usage | count | adjustment. Link usage to a job with work_order_id.",
    { product_id: UUID, delta: z.number(), reason: z.enum(["received", "usage", "count", "adjustment"]).optional(), note: z.string().optional(), work_order_id: UUID.optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "products:write");
      if (args.delta === 0) return errorText("delta must be non-zero.");
      const { data: prod } = await t(ctx, "products").select("stock_qty").eq("id", args.product_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!prod) return errorText("Product not found");
      const next = Number(prod.stock_qty) + args.delta;
      const { error: mErr } = await t(ctx, "stock_movements").insert({
        business_id: ctx.businessId, product_id: args.product_id, delta: args.delta,
        reason: args.reason ?? "adjustment", note: args.note?.trim() || null,
        work_order_id: args.work_order_id ?? null, created_by: ctx.userId,
      });
      if (mErr) throw mErr;
      const { error: pErr } = await t(ctx, "products").update({ stock_qty: next }).eq("id", args.product_id).eq("business_id", ctx.businessId);
      if (pErr) throw pErr;
      return text({ product_id: args.product_id, stock_qty: next });
    });
}
