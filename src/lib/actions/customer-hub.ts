"use server";

/**
 * Compatibility shim — old `customer_properties` / `customer_contacts` tables
 * are dropped in favour of the new `sites` / `contacts` tables.
 *
 * Existing UI components keep using these function signatures and the legacy
 * CustomerProperty / CustomerContact shapes; we map to/from the new tables.
 *
 * Notes still use the original `customer_notes` table (kept for now).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import {
  getSitesForAccount, createSite, updateSite, archiveSite,
  type SitePayload,
} from "@/lib/actions/sites";
import {
  getContactsForAccount, createContact, updateContact, archiveContact,
} from "@/lib/actions/contacts";
import type {
  CustomerProperty, CustomerContact, CustomerNote,
  Site, Contact, ContactRole,
} from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

// ── shape mappers ─────────────────────────────────────────────────────────────

function siteToProperty(s: Site): CustomerProperty {
  return {
    id: s.id,
    business_id: s.business_id,
    customer_id: s.account_id,
    label: s.label,
    address: s.address ?? '',
    city: s.city,
    postcode: s.postcode,
    country: s.country,
    notes: s.access_notes,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

function contactToCustomerContact(c: Contact): CustomerContact {
  return {
    id: c.id,
    business_id: c.business_id,
    customer_id: c.account_id,
    name: c.name,
    role: c.role === 'other' ? null : c.role,
    email: c.email,
    phone: c.phone,
    is_primary: c.role === 'primary',
    notes: c.notes,
    created_at: c.created_at,
  };
}

// ── Properties (→ sites) ─────────────────────────────────────────────────────

export async function getCustomerProperties(customerId: string): Promise<CustomerProperty[]> {
  const sites = await getSitesForAccount(customerId);
  return sites.map(siteToProperty);
}

export async function createCustomerProperty(
  customerId: string,
  payload: { label?: string; address: string; city?: string; postcode?: string; country?: string; notes?: string }
): Promise<CustomerProperty> {
  const site = await createSite(customerId, {
    label: payload.label ?? null,
    address: payload.address,
    city: payload.city ?? null,
    postcode: payload.postcode ?? null,
    country: payload.country ?? null,
    access_notes: payload.notes ?? null,
  } satisfies SitePayload);
  return siteToProperty(site);
}

export async function updateCustomerProperty(
  id: string,
  customerId: string,
  payload: Partial<Pick<CustomerProperty, "label" | "address" | "city" | "postcode" | "country" | "notes">>
): Promise<CustomerProperty> {
  const site = await updateSite(id, {
    ...(payload.label !== undefined ? { label: payload.label } : {}),
    ...(payload.address !== undefined ? { address: payload.address } : {}),
    ...(payload.city !== undefined ? { city: payload.city } : {}),
    ...(payload.postcode !== undefined ? { postcode: payload.postcode } : {}),
    ...(payload.country !== undefined ? { country: payload.country } : {}),
    ...(payload.notes !== undefined ? { access_notes: payload.notes } : {}),
  });
  revalidatePath(`/customers/${customerId}`);
  return siteToProperty(site);
}

export async function deleteCustomerProperty(id: string, customerId: string): Promise<void> {
  await archiveSite(id);
  revalidatePath(`/customers/${customerId}`);
}

// ── Contacts (→ contacts) ────────────────────────────────────────────────────

export async function getCustomerContacts(customerId: string): Promise<CustomerContact[]> {
  const contacts = await getContactsForAccount(customerId);
  return contacts.map(contactToCustomerContact);
}

export async function createCustomerContact(
  customerId: string,
  payload: { name: string; role?: string; email?: string; phone?: string; is_primary?: boolean; notes?: string }
): Promise<CustomerContact> {
  const role: ContactRole = payload.is_primary ? 'primary' : (payload.role as ContactRole) || 'other';
  const c = await createContact(customerId, {
    name: payload.name,
    email: payload.email ?? null,
    phone: payload.phone ?? null,
    role,
    notes: payload.notes ?? null,
  });
  return contactToCustomerContact(c);
}

export async function updateCustomerContact(
  id: string,
  customerId: string,
  payload: Partial<Pick<CustomerContact, "name" | "role" | "email" | "phone" | "is_primary" | "notes">>
): Promise<CustomerContact> {
  const update: Record<string, unknown> = {};
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.email !== undefined) update.email = payload.email;
  if (payload.phone !== undefined) update.phone = payload.phone;
  if (payload.notes !== undefined) update.notes = payload.notes;
  if (payload.is_primary !== undefined) update.role = payload.is_primary ? 'primary' : 'other';
  else if (payload.role !== undefined) update.role = payload.role;
  const c = await updateContact(id, update);
  revalidatePath(`/customers/${customerId}`);
  return contactToCustomerContact(c);
}

export async function deleteCustomerContact(id: string, customerId: string): Promise<void> {
  await archiveContact(id);
  revalidatePath(`/customers/${customerId}`);
}

// ── Notes (still on customer_notes table) ────────────────────────────────────

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
