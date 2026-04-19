"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { BillingProfile } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function getBillingProfilesForAccount(accountId: string): Promise<BillingProfile[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "billing_profiles")
    .select("*")
    .eq("account_id", accountId)
    .eq("business_id", businessId)
    .eq("archived", false)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as BillingProfile[];
}

export async function getDefaultBillingProfile(accountId: string): Promise<BillingProfile | null> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "billing_profiles")
    .select("*")
    .eq("account_id", accountId)
    .eq("business_id", businessId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw error;
  return data as BillingProfile | null;
}

export type BillingProfilePayload = {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
  tax_number?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  is_default?: boolean;
};

export async function createBillingProfile(accountId: string, payload: BillingProfilePayload): Promise<BillingProfile> {
  const { supabase, businessId } = await ctx();
  if (payload.is_default) {
    await tbl(supabase, "billing_profiles")
      .update({ is_default: false })
      .eq("account_id", accountId)
      .eq("business_id", businessId);
  }
  const { data, error } = await tbl(supabase, "billing_profiles")
    .insert({ account_id: accountId, business_id: businessId, ...payload })
    .select()
    .single();
  if (error) throw error;
  revalidatePath(`/customers/${accountId}`);
  return data as BillingProfile;
}

export async function updateBillingProfile(id: string, payload: Partial<BillingProfilePayload>): Promise<BillingProfile> {
  const { supabase, businessId } = await ctx();
  if (payload.is_default) {
    const existing = await tbl(supabase, "billing_profiles").select("account_id").eq("id", id).single();
    if (existing.data?.account_id) {
      await tbl(supabase, "billing_profiles")
        .update({ is_default: false })
        .eq("account_id", existing.data.account_id)
        .eq("business_id", businessId)
        .neq("id", id);
    }
  }
  const { data, error } = await tbl(supabase, "billing_profiles")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  if (data) revalidatePath(`/customers/${(data as BillingProfile).account_id}`);
  return data as BillingProfile;
}

export async function archiveBillingProfile(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  await tbl(supabase, "billing_profiles").update({ archived: true }).eq("id", id).eq("business_id", businessId);
}

// site_billing
export async function setSiteBilling(siteId: string, billingProfileId: string) {
  const { supabase } = await ctx();
  const { error } = await tbl(supabase, "site_billing")
    .upsert({ site_id: siteId, billing_profile_id: billingProfileId });
  if (error) throw error;
}

export async function getSiteBilling(siteId: string): Promise<{ billing_profile_id: string } | null> {
  const { supabase } = await ctx();
  const { data, error } = await tbl(supabase, "site_billing")
    .select("billing_profile_id")
    .eq("site_id", siteId)
    .maybeSingle();
  if (error) throw error;
  return data as { billing_profile_id: string } | null;
}
