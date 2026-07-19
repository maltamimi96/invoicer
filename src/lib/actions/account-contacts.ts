"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { AccountContact, AccountContactRole } from "@/types/database";

import { getUser } from "@/lib/auth";
import { assertOk } from "@/lib/db";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function getContactsForAccount(accountId: string): Promise<AccountContact[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "account_contacts")
    .select("*")
    .eq("account_id", accountId)
    .eq("business_id", businessId)
    .eq("archived", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as AccountContact[];
}

export async function getContact(id: string): Promise<AccountContact | null> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "account_contacts")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data as AccountContact | null;
}

export type AccountContactPayload = {
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: AccountContactRole;
  notes?: string | null;
};

export async function createContact(accountId: string, payload: AccountContactPayload): Promise<AccountContact> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "account_contacts")
    .insert({ account_id: accountId, business_id: businessId, role: 'other', ...payload })
    .select()
    .single();
  if (error) throw error;
  revalidatePath(`/customers/${accountId}`);
  return data as AccountContact;
}

export async function updateContact(id: string, payload: Partial<AccountContactPayload>): Promise<AccountContact> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "account_contacts")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  if (data) revalidatePath(`/customers/${(data as AccountContact).account_id}`);
  return data as AccountContact;
}

export async function archiveContact(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  assertOk(
    await tbl(supabase, "account_contacts").update({ archived: true }).eq("id", id).eq("business_id", businessId),
    "archive the contact",
  );
}
