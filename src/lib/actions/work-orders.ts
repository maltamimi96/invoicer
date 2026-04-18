"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { dispatchWebhook } from "@/lib/webhooks";
import { sendEmail } from "@/lib/email";
import { workOrderSubmittedEmailHtml } from "@/lib/emails/work-order-submitted";
import type { WorkOrder, WorkOrderPhoto, WorkOrderStatus, WorkOrderWithCustomer } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

export async function getWorkOrders(filters?: { status?: WorkOrderStatus; customer_id?: string }): Promise<WorkOrderWithCustomer[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  let query = tbl(supabase, "work_orders")
    .select("*, customers(id, name, email, company)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.customer_id) query = query.eq("customer_id", filters.customer_id);

  const { data, error } = await query;
  if (error) throw error;
  return data as WorkOrderWithCustomer[];
}

export async function getWorkOrder(id: string): Promise<WorkOrderWithCustomer> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "work_orders")
    .select("*, customers(id, name, email, company)")
    .eq("id", id)
    .eq("business_id", businessId)
    .single();
  if (error) throw error;
  return data as WorkOrderWithCustomer;
}

export async function createWorkOrder(payload: {
  title: string;
  description?: string;
  customer_id?: string | null;
  property_address?: string;
  assigned_to?: string | null;
  assigned_to_email?: string | null;
  assigned_to_profile_id?: string | null;
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  member_profile_ids?: string[];
  // Property-mgmt model
  site_id?: string | null;
  booker_contact_id?: string | null;
  onsite_contact_id?: string | null;
  billing_profile_id?: string | null;
  cc_contact_ids?: string[];
  reported_issue?: string | null;
}): Promise<WorkOrder> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data: biz } = await tbl(supabase, "businesses")
    .select("work_order_prefix, work_order_next_number")
    .eq("id", businessId)
    .single();

  const number = `${biz?.work_order_prefix ?? "WO"}-${String(biz?.work_order_next_number ?? 1).padStart(4, "0")}`;
  await tbl(supabase, "businesses")
    .update({ work_order_next_number: (biz?.work_order_next_number ?? 1) + 1 })
    .eq("id", businessId);

  const hasWorkers = (payload.member_profile_ids?.length ?? 0) > 0 || !!payload.assigned_to;
  const status = hasWorkers ? "assigned" : "draft";

  const { data, error } = await tbl(supabase, "work_orders").insert({
    business_id: businessId,
    user_id: user.id,
    number,
    title: payload.title,
    description: payload.description ?? null,
    customer_id: payload.customer_id ?? null,
    property_address: payload.property_address ?? null,
    assigned_to: payload.assigned_to ?? null,
    assigned_to_email: payload.assigned_to_email ?? null,
    assigned_to_profile_id: payload.assigned_to_profile_id ?? null,
    scheduled_date: payload.scheduled_date ?? null,
    start_time: payload.start_time ?? null,
    end_time: payload.end_time ?? null,
    site_id: payload.site_id ?? null,
    booker_contact_id: payload.booker_contact_id ?? null,
    onsite_contact_id: payload.onsite_contact_id ?? null,
    billing_profile_id: payload.billing_profile_id ?? null,
    cc_contact_ids: payload.cc_contact_ids ?? [],
    reported_issue: payload.reported_issue ?? null,
    status,
    photos: [],
  }).select().single();

  if (error) throw error;

  // Insert multi-worker assignments
  if (payload.member_profile_ids?.length) {
    await tbl(supabase, "work_order_assignments").insert(
      payload.member_profile_ids.map((pid) => ({
        work_order_id: data.id,
        business_id: businessId,
        member_profile_id: pid,
        assigned_by: user.id,
      }))
    );
  }

  revalidatePath("/work-orders");
  revalidatePath("/schedule");
  dispatchWebhook(businessId, "work_order.created", data);

  // Timeline event
  try {
    await tbl(supabase, "job_timeline_events").insert({
      business_id: businessId,
      work_order_id: data.id,
      type: "created",
      actor_type: "user",
      actor_id: user.id,
      actor_label: user.email ?? null,
      payload: { status: data.status, title: data.title, number: data.number },
    });
  } catch (e) {
    console.error("[work_orders.create] timeline event failed", e);
  }

  return data as WorkOrder;
}

export async function updateWorkOrder(id: string, payload: Partial<Pick<WorkOrder,
  'title' | 'description' | 'customer_id' | 'property_address' | 'assigned_to' |
  'assigned_to_email' | 'assigned_to_profile_id' | 'scheduled_date' | 'start_time' | 'end_time' |
  'scope_of_work' | 'worker_notes'
>> & { member_profile_ids?: string[] }): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { member_profile_ids, ...fields } = payload;

  if (Object.keys(fields).length > 0) {
    const { error } = await tbl(supabase, "work_orders")
      .update(fields)
      .eq("id", id)
      .eq("business_id", businessId);
    if (error) throw error;
  }

  // Sync multi-worker assignments if provided
  if (member_profile_ids !== undefined) {
    await tbl(supabase, "work_order_assignments").delete().eq("work_order_id", id);
    if (member_profile_ids.length > 0) {
      await tbl(supabase, "work_order_assignments").insert(
        member_profile_ids.map((pid) => ({
          work_order_id: id,
          business_id: businessId,
          member_profile_id: pid,
          assigned_by: user.id,
        }))
      );
    }
  }

  revalidatePath(`/work-orders/${id}`);
  revalidatePath("/work-orders");
  revalidatePath("/schedule");
}

export async function updateWorkOrderStatus(id: string, status: WorkOrderStatus): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "work_orders")
    .update({ status })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath(`/work-orders/${id}`);
  revalidatePath("/work-orders");
  if (status === "completed") {
    dispatchWebhook(businessId, "work_order.completed", { id, status });
  }
}

export async function updateWorkOrderPhotos(id: string, photos: WorkOrderPhoto[]): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "work_orders")
    .update({ photos })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath(`/work-orders/${id}`);
}

export async function submitWorkOrder(id: string, workerNotes: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "work_orders")
    .update({ status: "submitted", worker_notes: workerNotes })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;

  // Notify business owner — best-effort
  try {
    const [woRow, bizRow] = await Promise.all([
      tbl(supabase, "work_orders").select("title, property_address").eq("id", id).single().then((r: { data: { title: string; property_address: string | null } }) => r.data),
      tbl(supabase, "businesses").select("name, email, user_id").eq("id", businessId).single().then((r: { data: { name: string; email: string | null; user_id: string } }) => r.data),
    ]);

    if (bizRow?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      await sendEmail({
        to: bizRow.email,
        subject: `Work order submitted: ${woRow?.title ?? id}`,
        html: workOrderSubmittedEmailHtml({
          businessName: bizRow.name,
          workerName: user.user_metadata?.full_name ?? user.email ?? "A worker",
          workerEmail: user.email ?? "",
          title: woRow?.title ?? id,
          propertyAddress: woRow?.property_address,
          workerNotes: workerNotes || null,
          viewUrl: `${appUrl}/work-orders/${id}`,
        }),
      });
    }
  } catch {
    // Email failure is non-fatal
  }

  revalidatePath(`/work-orders/${id}`);
  revalidatePath("/work-orders");
}

export async function getTodayWorkOrders(): Promise<WorkOrderWithCustomer[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);
  const today = new Date().toISOString().split("T")[0];

  // Scheduled today (any non-cancelled status) OR active right now (in_progress / submitted)
  const { data, error } = await tbl(supabase, "work_orders")
    .select("*, customers(id, name, email, company)")
    .eq("business_id", businessId)
    .or(`scheduled_date.eq.${today},status.eq.in_progress,status.eq.submitted`)
    .neq("status", "cancelled")
    .neq("status", "completed")
    .order("scheduled_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data as WorkOrderWithCustomer[];
}

export async function deleteWorkOrder(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  // Clean up storage
  try {
    const { data: files } = await supabase.storage.from("work-order-photos").list(`${user.id}/${id}`);
    if (files?.length) {
      await supabase.storage.from("work-order-photos").remove(files.map((f) => `${user.id}/${id}/${f.name}`));
    }
  } catch { /* storage cleanup is best-effort */ }

  const { error } = await tbl(supabase, "work_orders").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/work-orders");
}
