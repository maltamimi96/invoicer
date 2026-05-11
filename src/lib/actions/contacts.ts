"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { Contact, LifecycleStage } from "@/types/database";

import { getUser } from "@/lib/auth";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export type ContactPayload = {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  tags?: string[];
  lifecycle_stage?: LifecycleStage;
};

export async function listContacts(opts?: { stage?: LifecycleStage }): Promise<Contact[]> {
  const { supabase, businessId } = await ctx();
  let q = tbl(supabase, "contacts")
    .select("*")
    .eq("business_id", businessId)
    .eq("archived", false)
    .order("created_at", { ascending: false });
  if (opts?.stage) q = q.eq("lifecycle_stage", opts.stage);
  const { data, error } = await q;
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

export async function createContact(payload: ContactPayload): Promise<Contact> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "contacts")
    .insert({
      business_id: businessId,
      lifecycle_stage: payload.lifecycle_stage ?? "contact",
      tags: payload.tags ?? [],
      name: payload.name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      company: payload.company ?? null,
      notes: payload.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/contacts");
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
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  return data as Contact;
}

export async function archiveContact(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "contacts")
    .update({ archived: true })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/contacts");
}

/** Promote a lead into a contact (lifecycle_stage='contact'). Idempotent — returns existing if already promoted. */
export async function addLeadAsContact(leadId: string): Promise<Contact> {
  const { supabase, businessId } = await ctx();

  const existing = await tbl(supabase, "contacts")
    .select("*")
    .eq("business_id", businessId)
    .eq("source_lead_id", leadId)
    .maybeSingle();
  if (existing.data) return existing.data as Contact;

  const { data: lead, error: leadErr } = await tbl(supabase, "leads")
    .select("id, name, email, phone, notes")
    .eq("id", leadId)
    .eq("business_id", businessId)
    .single();
  if (leadErr) throw leadErr;
  if (!lead) throw new Error("Lead not found");

  const { data, error } = await tbl(supabase, "contacts")
    .insert({
      business_id: businessId,
      name: lead.name,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      notes: lead.notes ?? null,
      source_lead_id: lead.id,
      lifecycle_stage: "contact",
      tags: [],
    })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/contacts");
  revalidatePath("/leads");
  return data as Contact;
}

/** Promote a contact to a customer. Creates customer row, links it back. Idempotent. */
export async function promoteContactToCustomer(contactId: string): Promise<{ contact: Contact; customerId: string }> {
  const { supabase, user, businessId } = await ctx();

  const { data: contact, error: cErr } = await tbl(supabase, "contacts")
    .select("*")
    .eq("id", contactId)
    .eq("business_id", businessId)
    .single();
  if (cErr) throw cErr;
  if (!contact) throw new Error("Contact not found");

  if (contact.customer_id) {
    return { contact: contact as Contact, customerId: contact.customer_id as string };
  }

  const { data: customer, error: custErr } = await tbl(supabase, "customers")
    .insert({
      business_id: businessId,
      user_id: user.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      notes: contact.notes,
      account_type: "individual",
    })
    .select("id")
    .single();
  if (custErr) throw custErr;

  const { data: updated, error: upErr } = await tbl(supabase, "contacts")
    .update({ customer_id: customer.id, lifecycle_stage: "customer" })
    .eq("id", contactId)
    .eq("business_id", businessId)
    .select()
    .single();
  if (upErr) throw upErr;

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/customers");
  return { contact: updated as Contact, customerId: customer.id };
}
