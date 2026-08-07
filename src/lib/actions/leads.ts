"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { dispatchWebhook } from "@/lib/webhooks";
import { emitAutomationEvent } from "@/lib/automations/emit";
import { createCustomer } from "@/lib/actions/customers";
import { createQuote } from "@/lib/actions/quotes";
import { createWorkOrder } from "@/lib/actions/work-orders";
import type { Lead, LeadStatus, LeadNote, LeadTagPreset } from "@/types/database";

import { getUser } from "@/lib/auth";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export async function getLeads(filters?: { status?: LeadStatus }): Promise<Lead[]> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  let query = tbl(supabase, "leads")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return data as Lead[];
}

export async function getLead(id: string): Promise<Lead> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "leads")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .single();

  if (error) throw error;
  return data as Lead;
}

export async function createLead(payload: {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  suburb?: string | null;
  service?: string | null;
  property_type?: string | null;
  timing?: string | null;
  notes?: string | null;
  source?: Lead["source"];
  source_ref?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}): Promise<Lead> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  // Dedup-aware ingest: matches existing leads by identity_key (email > phone
  // > name+address). Existing rows get the new payload merged in (filling
  // nulls, appending the new source) instead of creating a duplicate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("upsert_lead", {
    p_business_id:   businessId,
    p_user_id:       user.id,
    p_name:          payload.name,
    p_email:         payload.email   ?? null,
    p_phone:         payload.phone   ?? null,
    p_address:       payload.address ?? null,
    p_suburb:        payload.suburb  ?? null,
    p_service:       payload.service ?? null,
    p_property_type: payload.property_type ?? null,
    p_timing:        payload.timing  ?? null,
    p_notes:         payload.notes   ?? null,
    p_source:        payload.source  ?? "manual",
    p_source_ref:    payload.source_ref ?? null,
  }).single();

  if (error) throw error;

  // Backfill UTM params on the row directly (upsert_lead doesn't take them).
  if (payload.utm_source || payload.utm_medium || payload.utm_campaign) {
    const patch: Record<string, string | null> = {};
    if (payload.utm_source)   patch.utm_source   = payload.utm_source;
    if (payload.utm_medium)   patch.utm_medium   = payload.utm_medium;
    if (payload.utm_campaign) patch.utm_campaign = payload.utm_campaign;
    await tbl(supabase, "leads").update(patch).eq("id", (data as Lead).id);
  }

  revalidatePath("/leads");
  dispatchWebhook(businessId, "lead.created", data);
  // Awaited, unlike the webhook above: a lost automation is a follow-up that
  // never happens, with nothing to show it went missing.
  await emitAutomationEvent(supabase, businessId, "lead.created", "lead", data.id);
  return data as Lead;
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "leads")
    .update({ status })
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) throw error;
  revalidatePath("/leads");
  dispatchWebhook(businessId, "lead.updated", { id, status });
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "leads")
    .update(updates)
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) throw error;
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}

// ── Tags ────────────────────────────────────────────────────────────────────

/** Normalise a tag list: trim, drop empties, de-dupe (case-insensitive keep-first). */
function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = (raw ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export async function setLeadTags(id: string, tags: string[]): Promise<string[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const clean = cleanTags(tags);

  const { error } = await tbl(supabase, "leads")
    .update({ tags: clean })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return clean;
}

export async function listLeadTagPresets(): Promise<LeadTagPreset[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "lead_tag_presets")
    .select("*")
    .eq("business_id", businessId)
    .order("label");
  if (error) throw error;
  return data as LeadTagPreset[];
}

export async function createLeadTagPreset(label: string, color?: string | null): Promise<LeadTagPreset> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const clean = label.trim();
  if (!clean) throw new Error("A tag label is required");

  const { data, error } = await tbl(supabase, "lead_tag_presets")
    .upsert({ business_id: businessId, label: clean, color: color ?? null }, { onConflict: "business_id,label" })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/leads");
  return data as LeadTagPreset;
}

export async function deleteLeadTagPreset(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "lead_tag_presets")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/leads");
}

// ── Notes log ───────────────────────────────────────────────────────────────

export async function getLeadNotes(leadId: string): Promise<LeadNote[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "lead_notes")
    .select("*")
    .eq("lead_id", leadId)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as LeadNote[];
}

export async function addLeadNote(leadId: string, body: string): Promise<LeadNote> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const clean = body.trim();
  if (!clean) throw new Error("Note can't be empty");

  const { data, error } = await tbl(supabase, "lead_notes")
    .insert({ business_id: businessId, lead_id: leadId, user_id: user.id, body: clean })
    .select()
    .single();
  if (error) throw error;
  revalidatePath(`/leads/${leadId}`);
  return data as LeadNote;
}

export async function deleteLeadNote(noteId: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "lead_notes")
    .delete()
    .eq("id", noteId)
    .eq("business_id", businessId);
  if (error) throw error;
}

// ── Pipeline conversions ────────────────────────────────────────────────────

async function ensureCustomerForLead(lead: Lead): Promise<string> {
  if (lead.customer_id) return lead.customer_id;
  const customer = await createCustomer({
    name: lead.name,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    address: lead.address ?? null,
    city: lead.suburb ?? null,
    postcode: null,
    country: null,
    company: null,
    tax_number: null,
    notes: lead.notes ?? null,
    archived: false,
  });
  return customer.id;
}

export async function convertLeadToCustomer(leadId: string): Promise<{ customer_id: string; lead_id: string }> {
  const lead = await getLead(leadId);
  const customerId = await ensureCustomerForLead(lead);
  await updateLead(leadId, {
    customer_id: customerId,
    status: lead.status === "new" ? "contacted" : lead.status,
  } as Partial<Lead>);
  return { customer_id: customerId, lead_id: leadId };
}

export async function convertLeadToQuote(
  leadId: string,
  options: { expiry_days?: number; notes?: string | null } = {},
): Promise<{ quote_id: string; quote_number: string; customer_id: string }> {
  const lead = await getLead(leadId);
  const customerId = await ensureCustomerForLead(lead);
  const issueDate = new Date().toISOString().split("T")[0];
  const expiryDate = new Date(Date.now() + (options.expiry_days ?? 30) * 86400000).toISOString().split("T")[0];

  const quote = await createQuote({
    status: "draft",
    customer_id: customerId,
    issue_date: issueDate,
    expiry_date: expiryDate,
    line_items: [],
    subtotal: 0,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_total: 0,
    total: 0,
    notes: options.notes ?? lead.notes ?? null,
    terms: null,
    invoice_id: null,
    site_id: null,
    property_address: null,
  });

  await updateLead(leadId, {
    customer_id: customerId,
    quote_id: quote.id,
    status: "quoted",
  } as Partial<Lead>);

  return { quote_id: quote.id, quote_number: quote.number, customer_id: customerId };
}

export async function convertLeadToWorkOrder(
  leadId: string,
  options: { scheduled_date?: string | null; member_profile_ids?: string[] } = {},
): Promise<{ work_order_id: string; work_order_number: string; customer_id: string }> {
  const lead = await getLead(leadId);
  const customerId = await ensureCustomerForLead(lead);

  const wo = await createWorkOrder({
    title: lead.service ? `${lead.service} — ${lead.name}` : lead.name,
    description: lead.notes ?? undefined,
    customer_id: customerId,
    property_address: lead.address ?? undefined,
    scheduled_date: options.scheduled_date ?? null,
    member_profile_ids: options.member_profile_ids,
    reported_issue: lead.notes ?? null,
  });

  await updateLead(leadId, {
    customer_id: customerId,
    status: "won",
  } as Partial<Lead>);

  return { work_order_id: wo.id, work_order_number: wo.number, customer_id: customerId };
}

export async function deleteLead(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "leads")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) throw error;
  revalidatePath("/leads");
}
