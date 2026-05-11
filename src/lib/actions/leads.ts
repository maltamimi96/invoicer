"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { dispatchWebhook } from "@/lib/webhooks";
import { createCustomer } from "@/lib/actions/customers";
import { createQuote } from "@/lib/actions/quotes";
import { createWorkOrder } from "@/lib/actions/work-orders";
import type { Lead, LeadStatus } from "@/types/database";

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
