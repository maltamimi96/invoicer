"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { logJobEvent } from "./job-timeline";
import type { JobDocument } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function getJobDocuments(workOrderId: string): Promise<JobDocument[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "job_documents")
    .select("*")
    .eq("work_order_id", workOrderId)
    .eq("business_id", businessId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return data as JobDocument[];
}

export async function addJobDocument(payload: {
  work_order_id: string;
  name: string;
  url: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  category?: "permit" | "warranty" | "certificate" | "insurance" | "manual" | "contract" | "other";
  customer_visible?: boolean;
}): Promise<JobDocument> {
  const { supabase, user, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "job_documents").insert({
    business_id: businessId,
    work_order_id: payload.work_order_id,
    name: payload.name,
    url: payload.url,
    mime_type: payload.mime_type ?? null,
    size_bytes: payload.size_bytes ?? null,
    category: payload.category ?? "other",
    uploaded_by: user.id,
    uploaded_at: new Date().toISOString(),
    customer_visible: payload.customer_visible ?? false,
  }).select().single();
  if (error) throw error;

  await logJobEvent({
    workOrderId: payload.work_order_id,
    type: "document_uploaded",
    payload: { document_id: data.id, name: payload.name, category: payload.category ?? "other" },
    visibleToCustomer: payload.customer_visible ?? false,
  });

  revalidatePath(`/work-orders/${payload.work_order_id}`);
  return data as JobDocument;
}

export async function deleteJobDocument(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data: existing } = await tbl(supabase, "job_documents").select("work_order_id").eq("id", id).single();
  const { error } = await tbl(supabase, "job_documents").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  if (existing?.work_order_id) revalidatePath(`/work-orders/${existing.work_order_id}`);
}
