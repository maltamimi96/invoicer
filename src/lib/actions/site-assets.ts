"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { SiteAsset } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function getSiteAssets(siteId: string): Promise<SiteAsset[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "site_assets")
    .select("*")
    .eq("site_id", siteId)
    .eq("business_id", businessId)
    .eq("archived", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as SiteAsset[];
}

export type SiteAssetPayload = {
  name: string;
  type?: string | null;
  make?: string | null;
  model?: string | null;
  serial_number?: string | null;
  install_date?: string | null;
  warranty_expiry?: string | null;
  last_serviced?: string | null;
  notes?: string | null;
};

export async function createSiteAsset(siteId: string, payload: SiteAssetPayload): Promise<SiteAsset> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "site_assets")
    .insert({ site_id: siteId, business_id: businessId, ...payload })
    .select()
    .single();
  if (error) throw error;
  revalidatePath(`/sites/${siteId}`);
  return data as SiteAsset;
}

export async function updateSiteAsset(id: string, payload: Partial<SiteAssetPayload>): Promise<SiteAsset> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "site_assets")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  return data as SiteAsset;
}

export async function archiveSiteAsset(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  await tbl(supabase, "site_assets").update({ archived: true }).eq("id", id).eq("business_id", businessId);
}

export async function linkAssetToJob(assetId: string, workOrderId: string, action: 'inspected' | 'serviced' | 'repaired' | 'replaced' | 'installed' | 'removed' = 'serviced', notes?: string) {
  const { supabase } = await ctx();
  await tbl(supabase, "site_asset_jobs").upsert({ asset_id: assetId, work_order_id: workOrderId, action, notes: notes ?? null });
}

export async function getAssetServiceHistory(assetId: string) {
  const { supabase } = await ctx();
  const { data, error } = await tbl(supabase, "site_asset_jobs")
    .select("action, notes, created_at, work_orders(id, number, title, status, completed_at)")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
