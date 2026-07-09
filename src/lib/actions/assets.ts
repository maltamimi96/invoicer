"use server";

/**
 * Assets & equipment (field-services plugin). Track tools/vehicles/equipment,
 * assignment and service schedules. Scopes: assets:read / assets:write.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import type { Asset, AssetServiceLog, AssetCategory, AssetStatus } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uid = (v: string | null | undefined) => (v && UUID_RE.test(v.trim()) ? v.trim() : null);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function listAssets(): Promise<Asset[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "assets").select("*").eq("business_id", businessId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Asset[];
}

export async function createAsset(input: {
  name: string; category?: AssetCategory; identifier?: string | null; assigned_to?: string | null;
  purchase_date?: string | null; purchase_cost?: number | string | null; next_service_on?: string | null; notes?: string | null;
}): Promise<Asset> {
  const { supabase, businessId } = await ctx();
  if (!input.name?.trim()) throw new Error("Name is required");
  const { data, error } = await tbl(supabase, "assets").insert({
    business_id: businessId, name: input.name.trim(), category: input.category ?? "tool",
    identifier: input.identifier?.trim() || null, assigned_to: uid(input.assigned_to),
    purchase_date: input.purchase_date?.trim() || null,
    purchase_cost: input.purchase_cost != null && input.purchase_cost !== "" ? num(input.purchase_cost) : null,
    next_service_on: input.next_service_on?.trim() || null, notes: input.notes?.trim() || null,
  }).select().single();
  if (error) throw error;
  revalidatePath("/assets");
  return data as Asset;
}

export async function updateAsset(id: string, patch: Partial<{
  name: string; category: AssetCategory; identifier: string | null; status: AssetStatus; assigned_to: string | null;
  purchase_date: string | null; purchase_cost: number | string | null; next_service_on: string | null; notes: string | null;
}>): Promise<void> {
  const { supabase, businessId } = await ctx();
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) clean.name = patch.name?.trim();
  if (patch.category !== undefined) clean.category = patch.category;
  if (patch.identifier !== undefined) clean.identifier = patch.identifier?.trim() || null;
  if (patch.status !== undefined) clean.status = patch.status;
  if (patch.assigned_to !== undefined) clean.assigned_to = uid(patch.assigned_to);
  if (patch.purchase_date !== undefined) clean.purchase_date = patch.purchase_date || null;
  if (patch.purchase_cost !== undefined) clean.purchase_cost = patch.purchase_cost === null || patch.purchase_cost === "" ? null : num(patch.purchase_cost);
  if (patch.next_service_on !== undefined) clean.next_service_on = patch.next_service_on || null;
  if (patch.notes !== undefined) clean.notes = patch.notes?.trim() || null;
  if (Object.keys(clean).length === 0) return;
  const { error } = await tbl(supabase, "assets").update(clean).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/assets");
}

export async function deleteAsset(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "assets").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/assets");
}

/** Log a service; advances the asset's next-service date to next_due. */
export async function logAssetService(input: {
  asset_id: string; serviced_on?: string; description?: string | null; cost?: number | string | null; next_due?: string | null;
}): Promise<void> {
  const { supabase, user, businessId } = await ctx();
  const { error: lErr } = await tbl(supabase, "asset_service_logs").insert({
    business_id: businessId, asset_id: input.asset_id,
    serviced_on: input.serviced_on || new Date().toISOString().split("T")[0],
    description: input.description?.trim() || null,
    cost: input.cost != null && input.cost !== "" ? num(input.cost) : null,
    next_due: input.next_due?.trim() || null, created_by: user.id,
  });
  if (lErr) throw lErr;
  if (input.next_due) {
    await tbl(supabase, "assets").update({ next_service_on: input.next_due }).eq("id", input.asset_id).eq("business_id", businessId);
  }
  revalidatePath("/assets");
}

export async function listAssetServiceLogs(assetId: string): Promise<AssetServiceLog[]> {
  const { supabase, businessId } = await ctx();
  const { data } = await tbl(supabase, "asset_service_logs").select("*")
    .eq("business_id", businessId).eq("asset_id", assetId).order("serviced_on", { ascending: false }).limit(100);
  return (data ?? []) as AssetServiceLog[];
}
