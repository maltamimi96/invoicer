"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { Contact, ContactRole } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function getContactsForAccount(accountId: string): Promise<Contact[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "contacts")
    .select("*")
    .eq("account_id", accountId)
    .eq("business_id", businessId)
    .eq("archived", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as Contact[];
}

export async function getContact(id: string): Promise<Contact | null> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "contacts")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data as Contact | null;
}

export type ContactPayload = {
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: ContactRole;
  notes?: string | null;
};

export async function createContact(accountId: string, payload: ContactPayload): Promise<Contact> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "contacts")
    .insert({ account_id: accountId, business_id: businessId, role: 'other', ...payload })
    .select()
    .single();
  if (error) throw error;
  revalidatePath(`/customers/${accountId}`);
  return data as Contact;
}

export async function updateContact(id: string, payload: Partial<ContactPayload>): Promise<Contact> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "contacts")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  if (data) revalidatePath(`/customers/${(data as Contact).account_id}`);
  return data as Contact;
}

export async function archiveContact(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  await tbl(supabase, "contacts").update({ archived: true }).eq("id", id).eq("business_id", businessId);
}
