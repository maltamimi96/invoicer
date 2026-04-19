"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { logJobEvent } from "./job-timeline";
import type { JobSignature } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function getJobSignatures(workOrderId: string): Promise<JobSignature[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "job_signatures")
    .select("*")
    .eq("work_order_id", workOrderId)
    .eq("business_id", businessId)
    .order("signed_at", { ascending: true });
  if (error) throw error;
  return data as JobSignature[];
}

export async function addJobSignature(payload: {
  work_order_id: string;
  signed_by_name: string;
  signed_by_role?: string | null;
  signature_url: string;
  purpose: "quote" | "completion" | "change_order" | "safety" | "other";
}): Promise<JobSignature> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "job_signatures").insert({
    business_id: businessId,
    work_order_id: payload.work_order_id,
    signed_by_name: payload.signed_by_name,
    signed_by_role: payload.signed_by_role ?? null,
    signature_url: payload.signature_url,
    purpose: payload.purpose,
    signed_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;

  await logJobEvent({
    workOrderId: payload.work_order_id,
    type: "signature_captured",
    payload: { signature_id: data.id, signed_by: payload.signed_by_name, purpose: payload.purpose },
    visibleToCustomer: true,
  });

  revalidatePath(`/work-orders/${payload.work_order_id}`);
  return data as JobSignature;
}

export async function deleteJobSignature(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data: existing } = await tbl(supabase, "job_signatures").select("work_order_id").eq("id", id).single();
  const { error } = await tbl(supabase, "job_signatures").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  if (existing?.work_order_id) revalidatePath(`/work-orders/${existing.work_order_id}`);
}
