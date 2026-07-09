"use server";

/**
 * Inventory & stock (field-services plugin) — extends products with stock
 * tracking + a movements ledger. Uses the products:read/write scope surface.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import type { InventoryProduct, StockMovement, StockReason } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uid = (v: string | null | undefined) => (v && UUID_RE.test(v.trim()) ? v.trim() : null);
const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function listInventory(): Promise<InventoryProduct[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "products").select("*")
    .eq("business_id", businessId).eq("track_stock", true).eq("archived", false).order("name");
  if (error) throw error;
  return (data ?? []) as InventoryProduct[];
}

/** Create a tracked stock item (a product with stock tracking on). */
export async function createStockItem(input: {
  name: string; unit?: string | null; stock_qty?: number | string;
  reorder_point?: number | string | null; unit_cost?: number | string | null; unit_price?: number | string;
}): Promise<InventoryProduct> {
  const { supabase, user, businessId } = await ctx();
  if (!input.name?.trim()) throw new Error("Name is required");
  const { data, error } = await tbl(supabase, "products").insert({
    business_id: businessId, user_id: user.id, name: input.name.trim(),
    unit: input.unit?.trim() || null, unit_price: num(input.unit_price), tax_rate: 0,
    track_stock: true, stock_qty: num(input.stock_qty),
    reorder_point: input.reorder_point != null && input.reorder_point !== "" ? num(input.reorder_point) : null,
    unit_cost: input.unit_cost != null && input.unit_cost !== "" ? num(input.unit_cost) : null,
  }).select().single();
  if (error) throw error;
  revalidatePath("/inventory");
  return data as InventoryProduct;
}

/** Turn stock tracking on/off for an existing product + set its levels. */
export async function setStockTracking(productId: string, patch: {
  track_stock?: boolean; stock_qty?: number | string; reorder_point?: number | string | null; unit_cost?: number | string | null;
}): Promise<void> {
  const { supabase, businessId } = await ctx();
  const clean: Record<string, unknown> = {};
  if (patch.track_stock !== undefined) clean.track_stock = !!patch.track_stock;
  if (patch.stock_qty !== undefined) clean.stock_qty = num(patch.stock_qty);
  if (patch.reorder_point !== undefined) clean.reorder_point = patch.reorder_point === null || patch.reorder_point === "" ? null : num(patch.reorder_point);
  if (patch.unit_cost !== undefined) clean.unit_cost = patch.unit_cost === null || patch.unit_cost === "" ? null : num(patch.unit_cost);
  if (Object.keys(clean).length === 0) return;
  const { error } = await tbl(supabase, "products").update(clean).eq("id", productId).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/inventory");
}

/** Record a stock movement and update the product's on-hand quantity. */
export async function adjustStock(input: {
  product_id: string; delta: number | string; reason?: StockReason; note?: string | null; work_order_id?: string | null;
}): Promise<{ stock_qty: number }> {
  const { supabase, user, businessId } = await ctx();
  const delta = num(input.delta);
  if (delta === 0) throw new Error("Enter a non-zero quantity");

  const { data: prod } = await tbl(supabase, "products").select("stock_qty").eq("id", input.product_id).eq("business_id", businessId).maybeSingle();
  if (!prod) throw new Error("Product not found");
  const next = num(prod.stock_qty) + delta;

  const { error: mErr } = await tbl(supabase, "stock_movements").insert({
    business_id: businessId, product_id: input.product_id, delta,
    reason: input.reason ?? "adjustment", note: input.note?.trim() || null,
    work_order_id: uid(input.work_order_id), created_by: user.id,
  });
  if (mErr) throw mErr;
  const { error: pErr } = await tbl(supabase, "products").update({ stock_qty: next }).eq("id", input.product_id).eq("business_id", businessId);
  if (pErr) throw pErr;
  revalidatePath("/inventory");
  return { stock_qty: next };
}

export async function listStockMovements(productId: string): Promise<StockMovement[]> {
  const { supabase, businessId } = await ctx();
  const { data } = await tbl(supabase, "stock_movements").select("*")
    .eq("business_id", businessId).eq("product_id", productId).order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as StockMovement[];
}
