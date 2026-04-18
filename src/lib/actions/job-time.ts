"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { logJobEvent } from "./job-timeline";
import type { JobTimeEntry } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function getJobTimeEntries(workOrderId: string): Promise<JobTimeEntry[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "job_time_entries")
    .select("*")
    .eq("work_order_id", workOrderId)
    .eq("business_id", businessId)
    .order("started_at", { ascending: true });
  if (error) throw error;
  return data as JobTimeEntry[];
}

/** Start a clock — returns the open entry. Pass type "work" | "travel" | "break". */
export async function startTimeEntry(payload: {
  work_order_id: string;
  type?: "work" | "travel" | "break";
  member_profile_id?: string | null;
  notes?: string | null;
}): Promise<JobTimeEntry> {
  const { supabase, user, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "job_time_entries").insert({
    business_id: businessId,
    work_order_id: payload.work_order_id,
    member_profile_id: payload.member_profile_id ?? null,
    user_id: user.id,
    type: payload.type ?? "work",
    started_at: new Date().toISOString(),
    notes: payload.notes ?? null,
  }).select().single();
  if (error) throw error;

  await logJobEvent({
    workOrderId: payload.work_order_id,
    type: "time_started",
    payload: { entry_id: data.id, type: payload.type ?? "work" },
  });

  revalidatePath(`/work-orders/${payload.work_order_id}`);
  return data as JobTimeEntry;
}

/** Stop an open entry. Computes duration_seconds. */
export async function stopTimeEntry(entryId: string, notes?: string): Promise<JobTimeEntry> {
  const { supabase, businessId } = await ctx();
  const { data: existing, error: fetchErr } = await tbl(supabase, "job_time_entries")
    .select("*").eq("id", entryId).eq("business_id", businessId).single();
  if (fetchErr) throw fetchErr;
  if (existing.ended_at) return existing as JobTimeEntry;

  const endedAt = new Date();
  const startedAt = new Date(existing.started_at);
  const duration = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));

  const { data, error } = await tbl(supabase, "job_time_entries")
    .update({
      ended_at: endedAt.toISOString(),
      duration_seconds: duration,
      notes: notes ?? existing.notes,
    })
    .eq("id", entryId)
    .eq("business_id", businessId)
    .select().single();
  if (error) throw error;

  await logJobEvent({
    workOrderId: existing.work_order_id,
    type: "time_ended",
    payload: { entry_id: entryId, duration_seconds: duration },
  });

  revalidatePath(`/work-orders/${existing.work_order_id}`);
  return data as JobTimeEntry;
}

/** Manually log a completed time block (for after-the-fact entries). */
export async function logTimeEntry(payload: {
  work_order_id: string;
  started_at: string;
  ended_at: string;
  type?: "work" | "travel" | "break";
  member_profile_id?: string | null;
  notes?: string | null;
}): Promise<JobTimeEntry> {
  const { supabase, user, businessId } = await ctx();
  const duration = Math.max(0, Math.floor((new Date(payload.ended_at).getTime() - new Date(payload.started_at).getTime()) / 1000));
  const { data, error } = await tbl(supabase, "job_time_entries").insert({
    business_id: businessId,
    work_order_id: payload.work_order_id,
    member_profile_id: payload.member_profile_id ?? null,
    user_id: user.id,
    type: payload.type ?? "work",
    started_at: payload.started_at,
    ended_at: payload.ended_at,
    duration_seconds: duration,
    notes: payload.notes ?? null,
  }).select().single();
  if (error) throw error;

  await logJobEvent({
    workOrderId: payload.work_order_id,
    type: "time_ended",
    payload: { entry_id: data.id, duration_seconds: duration, manual: true },
  });

  revalidatePath(`/work-orders/${payload.work_order_id}`);
  return data as JobTimeEntry;
}

export async function deleteTimeEntry(entryId: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data: existing } = await tbl(supabase, "job_time_entries").select("work_order_id").eq("id", entryId).single();
  const { error } = await tbl(supabase, "job_time_entries").delete().eq("id", entryId).eq("business_id", businessId);
  if (error) throw error;
  if (existing?.work_order_id) revalidatePath(`/work-orders/${existing.work_order_id}`);
}
