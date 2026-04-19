"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { logJobEvent } from "./job-timeline";
import type { JobMaterial } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function getJobMaterials(workOrderId: string): Promise<JobMaterial[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "job_materials")
    .select("*")
    .eq("work_order_id", workOrderId)
    .eq("business_id", businessId)
    .order("added_at", { ascending: true });
  if (error) throw error;
  return data as JobMaterial[];
}

export async function addJobMaterial(payload: {
  work_order_id: string;
  name: string;
  qty: number;
  unit?: string | null;
  unit_cost?: number | null;
  unit_price?: number | null;
  product_id?: string | null;
  billable?: boolean;
}): Promise<JobMaterial> {
  const { supabase, user, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "job_materials").insert({
    business_id: businessId,
    work_order_id: payload.work_order_id,
    product_id: payload.product_id ?? null,
    name: payload.name,
    qty: payload.qty,
    unit: payload.unit ?? null,
    unit_cost: payload.unit_cost ?? null,
    unit_price: payload.unit_price ?? null,
    added_by: user.id,
    added_at: new Date().toISOString(),
    billable: payload.billable ?? true,
  }).select().single();
  if (error) throw error;

  await logJobEvent({
    workOrderId: payload.work_order_id,
    type: "material_added",
    payload: { material_id: data.id, name: payload.name, qty: payload.qty },
  });

  revalidatePath(`/work-orders/${payload.work_order_id}`);
  return data as JobMaterial;
}

export async function updateJobMaterial(id: string, payload: Partial<Pick<JobMaterial, 'name' | 'qty' | 'unit' | 'unit_cost' | 'unit_price' | 'billable'>>): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data: existing } = await tbl(supabase, "job_materials").select("work_order_id").eq("id", id).single();
  const { error } = await tbl(supabase, "job_materials")
    .update(payload).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  if (existing?.work_order_id) revalidatePath(`/work-orders/${existing.work_order_id}`);
}

export async function deleteJobMaterial(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data: existing } = await tbl(supabase, "job_materials").select("work_order_id").eq("id", id).single();
  const { error } = await tbl(supabase, "job_materials").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  if (existing?.work_order_id) revalidatePath(`/work-orders/${existing.work_order_id}`);
}
