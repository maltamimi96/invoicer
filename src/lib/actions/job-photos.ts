"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { logJobEvent } from "./job-timeline";
import type { JobPhoto, JobPhotoPhase } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function getJobPhotos(workOrderId: string): Promise<JobPhoto[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "job_photos")
    .select("*")
    .eq("work_order_id", workOrderId)
    .eq("business_id", businessId)
    .order("taken_at", { ascending: true });
  if (error) throw error;
  return data as JobPhoto[];
}

export async function addJobPhoto(payload: {
  work_order_id: string;
  url: string;
  phase: JobPhotoPhase;
  caption?: string | null;
  lat?: number | null;
  lng?: number | null;
  taken_at?: string | null;
  customer_visible?: boolean;
}): Promise<JobPhoto> {
  const { supabase, user, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "job_photos").insert({
    business_id: businessId,
    work_order_id: payload.work_order_id,
    url: payload.url,
    phase: payload.phase,
    caption: payload.caption ?? null,
    lat: payload.lat ?? null,
    lng: payload.lng ?? null,
    taken_by: user.id,
    taken_at: payload.taken_at ?? new Date().toISOString(),
    customer_visible: payload.customer_visible ?? true,
  }).select().single();
  if (error) throw error;

  await logJobEvent({
    workOrderId: payload.work_order_id,
    type: "photo_added",
    payload: { phase: payload.phase, url: payload.url, caption: payload.caption ?? null },
    visibleToCustomer: payload.customer_visible ?? true,
  });

  revalidatePath(`/work-orders/${payload.work_order_id}`);
  return data as JobPhoto;
}

export async function updateJobPhoto(id: string, payload: Partial<Pick<JobPhoto, 'phase' | 'caption' | 'customer_visible'>>): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data: existing } = await tbl(supabase, "job_photos").select("work_order_id").eq("id", id).single();
  const { error } = await tbl(supabase, "job_photos")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  if (existing?.work_order_id) revalidatePath(`/work-orders/${existing.work_order_id}`);
}

export async function deleteJobPhoto(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data: existing } = await tbl(supabase, "job_photos").select("work_order_id").eq("id", id).single();
  const { error } = await tbl(supabase, "job_photos").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  if (existing?.work_order_id) revalidatePath(`/work-orders/${existing.work_order_id}`);
}
