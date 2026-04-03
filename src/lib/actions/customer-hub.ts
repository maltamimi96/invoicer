"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { CustomerProperty, CustomerContact, CustomerNote } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

// ── Properties ────────────────────────────────────────────────────────────────

export async function getCustomerProperties(customerId: string): Promise<CustomerProperty[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customer_properties")
    .select("*")
    .eq("customer_id", customerId)
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as CustomerProperty[];
}

export async function createCustomerProperty(
  customerId: string,
  payload: { label?: string; address: string; city?: string; postcode?: string; country?: string; notes?: string }
): Promise<CustomerProperty> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customer_properties")
    .insert({
      customer_id: customerId,
      business_id: businessId,
      label: payload.label ?? null,
      address: payload.address,
      city: payload.city ?? null,
      postcode: payload.postcode ?? null,
      country: payload.country ?? null,
      notes: payload.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  revalidatePath(`/customers/${customerId}`);
  return data as CustomerProperty;
}

export async function updateCustomerProperty(
  id: string,
  customerId: string,
  payload: Partial<Pick<CustomerProperty, "label" | "address" | "city" | "postcode" | "country" | "notes">>
): Promise<CustomerProperty> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customer_properties")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  revalidatePath(`/customers/${customerId}`);
  return data as CustomerProperty;
}

export async function deleteCustomerProperty(id: string, customerId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "customer_properties")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath(`/customers/${customerId}`);
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export async function getCustomerContacts(customerId: string): Promise<CustomerContact[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customer_contacts")
    .select("*")
    .eq("customer_id", customerId)
    .eq("business_id", businessId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as CustomerContact[];
}

export async function createCustomerContact(
  customerId: string,
  payload: { name: string; role?: string; email?: string; phone?: string; is_primary?: boolean; notes?: string }
): Promise<CustomerContact> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customer_contacts")
    .insert({
      customer_id: customerId,
      business_id: businessId,
      name: payload.name,
      role: payload.role ?? null,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      is_primary: payload.is_primary ?? false,
      notes: payload.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  revalidatePath(`/customers/${customerId}`);
  return data as CustomerContact;
}

export async function updateCustomerContact(
  id: string,
  customerId: string,
  payload: Partial<Pick<CustomerContact, "name" | "role" | "email" | "phone" | "is_primary" | "notes">>
): Promise<CustomerContact> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customer_contacts")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  revalidatePath(`/customers/${customerId}`);
  return data as CustomerContact;
}

export async function deleteCustomerContact(id: string, customerId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "customer_contacts")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath(`/customers/${customerId}`);
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function getCustomerNotes(customerId: string): Promise<CustomerNote[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customer_notes")
    .select("*")
    .eq("customer_id", customerId)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as CustomerNote[];
}

export async function createCustomerNote(customerId: string, content: string): Promise<CustomerNote> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customer_notes")
    .insert({ customer_id: customerId, business_id: businessId, content })
    .select()
    .single();
  if (error) throw error;
  revalidatePath(`/customers/${customerId}`);
  return data as CustomerNote;
}

export async function deleteCustomerNote(id: string, customerId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "customer_notes")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath(`/customers/${customerId}`);
}
