"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { Site, SiteContact } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function getSitesForAccount(accountId: string): Promise<Site[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "sites")
    .select("*")
    .eq("account_id", accountId)
    .eq("business_id", businessId)
    .eq("archived", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as Site[];
}

export async function getSite(id: string): Promise<Site | null> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "sites")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data as Site | null;
}

export type SitePayload = {
  label?: string | null;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
  access_notes?: string | null;
  gate_code?: string | null;
  parking_notes?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export async function createSite(accountId: string, payload: SitePayload): Promise<Site> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "sites")
    .insert({ account_id: accountId, business_id: businessId, ...payload })
    .select()
    .single();
  if (error) throw error;
  revalidatePath(`/customers/${accountId}`);
  return data as Site;
}

export async function updateSite(id: string, payload: SitePayload): Promise<Site> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "sites")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  if (data) revalidatePath(`/customers/${(data as Site).account_id}`);
  return data as Site;
}

export async function archiveSite(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  await tbl(supabase, "sites").update({ archived: true }).eq("id", id).eq("business_id", businessId);
}

// site_contacts (link)
export async function getSiteContacts(siteId: string): Promise<SiteContact[]> {
  const { supabase } = await ctx();
  const { data, error } = await tbl(supabase, "site_contacts")
    .select("*")
    .eq("site_id", siteId);
  if (error) throw error;
  return data as SiteContact[];
}

export async function linkContactToSite(siteId: string, contactId: string, role: SiteContact["role"] = "tenant", isPrimary = false) {
  const { supabase } = await ctx();
  const { error } = await tbl(supabase, "site_contacts")
    .upsert({ site_id: siteId, contact_id: contactId, role, is_primary: isPrimary });
  if (error) throw error;
}

export async function unlinkContactFromSite(siteId: string, contactId: string) {
  const { supabase } = await ctx();
  await tbl(supabase, "site_contacts").delete().eq("site_id", siteId).eq("contact_id", contactId);
}
