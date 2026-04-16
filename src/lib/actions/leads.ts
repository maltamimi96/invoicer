"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { dispatchWebhook } from "@/lib/webhooks";
import type { Lead, LeadStatus } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export async function getLeads(filters?: { status?: LeadStatus }): Promise<Lead[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

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
  suburb?: string | null;
  service?: string | null;
  property_type?: string | null;
  timing?: string | null;
  notes?: string | null;
  source?: Lead["source"];
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}): Promise<Lead> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "leads")
    .insert({
      ...payload,
      status: "new",
      business_id: businessId,
      user_id: user.id,
    })
    .select("*")
    .single();

  if (error) throw error;
  revalidatePath("/leads");
  dispatchWebhook(businessId, "lead.created", data);
  return data as Lead;
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "leads")
    .update(updates)
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) throw error;
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}

export async function deleteLead(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "leads")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) throw error;
  revalidatePath("/leads");
}
