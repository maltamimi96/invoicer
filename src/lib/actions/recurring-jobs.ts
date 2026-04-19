"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { RecurringJob, RecurringJobCadence } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export type RecurringJobInput = {
  name: string;
  title: string;
  description?: string | null;
  customer_id?: string | null;
  site_id?: string | null;
  property_address?: string | null;
  reported_issue?: string | null;
  member_profile_ids?: string[];
  cadence: RecurringJobCadence;
  preferred_weekday?: number | null;
  preferred_day_of_month?: number | null;
  preferred_start_time?: string | null;
  preferred_duration_minutes?: number | null;
  generate_days_ahead?: number;
  next_occurrence_at: string;
  ends_on?: string | null;
  active?: boolean;
};

export async function getRecurringJobs(): Promise<RecurringJob[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "recurring_jobs")
    .select("*")
    .eq("business_id", businessId)
    .order("next_occurrence_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RecurringJob[];
}

export async function createRecurringJob(input: RecurringJobInput): Promise<RecurringJob> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "recurring_jobs").insert({
    business_id: businessId,
    user_id: user.id,
    name: input.name,
    title: input.title,
    description: input.description ?? null,
    customer_id: input.customer_id ?? null,
    site_id: input.site_id ?? null,
    property_address: input.property_address ?? null,
    reported_issue: input.reported_issue ?? null,
    member_profile_ids: input.member_profile_ids ?? [],
    cadence: input.cadence,
    preferred_weekday: input.preferred_weekday ?? null,
    preferred_day_of_month: input.preferred_day_of_month ?? null,
    preferred_start_time: input.preferred_start_time ?? null,
    preferred_duration_minutes: input.preferred_duration_minutes ?? null,
    generate_days_ahead: input.generate_days_ahead ?? 14,
    next_occurrence_at: input.next_occurrence_at,
    ends_on: input.ends_on ?? null,
    active: input.active ?? true,
  }).select().single();

  if (error) throw error;
  revalidatePath("/recurring");
  return data as RecurringJob;
}

export async function updateRecurringJob(id: string, updates: Partial<RecurringJobInput>): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const fields: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
  const { error } = await tbl(supabase, "recurring_jobs")
    .update(fields).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/recurring");
}

export async function setRecurringJobActive(id: string, active: boolean): Promise<void> {
  await updateRecurringJob(id, { active });
}

export async function deleteRecurringJob(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "recurring_jobs")
    .delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/recurring");
}

