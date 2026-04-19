"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { CustomerPortalToken } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export async function listPortalTokens(customerId: string): Promise<CustomerPortalToken[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customer_portal_tokens")
    .select("*")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomerPortalToken[];
}

export async function createPortalLink(
  customerId: string,
  options: { expires_in_days?: number | null } = {}
): Promise<{ token: string; url: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const businessId = await getActiveBizId(supabase, user.id);

  const token = "cust_" + randomBytes(24).toString("hex");
  const expires_at = options.expires_in_days
    ? new Date(Date.now() + options.expires_in_days * 86_400_000).toISOString()
    : null;

  const { error } = await tbl(supabase, "customer_portal_tokens").insert({
    token,
    business_id: businessId,
    customer_id: customerId,
    created_by: user.id,
    expires_at,
  });
  if (error) throw error;

  revalidatePath(`/customers/${customerId}`);
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  return { token, url: `${base}/portal/${token}` };
}

export async function revokePortalLink(token: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: existing } = await tbl(supabase, "customer_portal_tokens")
    .select("customer_id")
    .eq("token", token)
    .eq("business_id", businessId)
    .maybeSingle();

  const { error } = await tbl(supabase, "customer_portal_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token)
    .eq("business_id", businessId);
  if (error) throw error;

  if (existing?.customer_id) revalidatePath(`/customers/${existing.customer_id}`);
}
