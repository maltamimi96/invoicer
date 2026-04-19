"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { dispatchWebhook } from "@/lib/webhooks";
import { sendEmail } from "@/lib/email";
import { workOrderSubmittedEmailHtml } from "@/lib/emails/work-order-submitted";
import { getRecipientsForRoles } from "@/lib/notifications/recipients";
import { logJobEvent } from "./job-timeline";
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

    if ("scheduled_date" in fields || "start_time" in fields || "end_time" in fields) {
      await logJobEvent({
        workOrderId: id,
        type: "rescheduled",
        payload: {
          scheduled_date: fields.scheduled_date ?? null,
          start_time: fields.start_time ?? null,
          end_time: fields.end_time ?? null,
        },
      });
    }
    if ("scope_of_work" in fields || "description" in fields) {
      await logJobEvent({ workOrderId: id, type: "scope_change", payload: {} });
    }
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
      await logJobEvent({
        workOrderId: id,
        type: "assigned",
        payload: { worker_count: member_profile_ids.length, member_profile_ids },
      });
    } else {
      await logJobEvent({ workOrderId: id, type: "unassigned", payload: {} });
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

  // Read previous status so we can record transition + completion timestamp
  const { data: prev } = await tbl(supabase, "work_orders")
    .select("status").eq("id", id).eq("business_id", businessId).single();
  const fromStatus = prev?.status as WorkOrderStatus | undefined;

  const updateFields: Record<string, unknown> = { status };
  if (status === "in_progress" && fromStatus !== "in_progress") updateFields.started_at = new Date().toISOString();
  if (status === "completed") updateFields.completed_at = new Date().toISOString();

  const { error } = await tbl(supabase, "work_orders")
    .update(updateFields)
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;

  await logJobEvent({
    workOrderId: id,
    type: "status_change",
    payload: { from: fromStatus ?? null, to: status },
  });

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

  // Notify owner + admins — best-effort
  try {
    const [woRow, bizRow, recipients] = await Promise.all([
      tbl(supabase, "work_orders").select("title, property_address").eq("id", id).single().then((r: { data: { title: string; property_address: string | null } }) => r.data),
      tbl(supabase, "businesses").select("name").eq("id", businessId).single().then((r: { data: { name: string } }) => r.data),
      getRecipientsForRoles(supabase, businessId, ['owner', 'admin']),
    ]);

    if (recipients.length > 0) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      await sendEmail({
        to: recipients,
        subject: `Work order submitted: ${woRow?.title ?? id}`,
        html: workOrderSubmittedEmailHtml({
          businessName: bizRow?.name ?? "",
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

export interface RelatedQuote {
  id: string; number: string; status: string; total: number; issue_date: string;
}
export interface RelatedInvoice {
  id: string; number: string; status: string; total: number; amount_paid: number; due_date: string;
}

/** Fetch quotes & invoices linked to a work order via work_order_id. */
export async function getWorkOrderFinancials(workOrderId: string): Promise<{ quotes: RelatedQuote[]; invoices: RelatedInvoice[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const [qRes, iRes] = await Promise.all([
    tbl(supabase, "quotes")
      .select("id, number, status, total, issue_date")
      .eq("business_id", businessId)
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: false }),
    tbl(supabase, "invoices")
      .select("id, number, status, total, amount_paid, due_date")
      .eq("business_id", businessId)
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    quotes: (qRes.data ?? []) as RelatedQuote[],
    invoices: (iRes.data ?? []) as RelatedInvoice[],
  };
}

/** Link an existing quote or invoice to a work order. */
export async function linkFinancialToWorkOrder(
  kind: "quote" | "invoice",
  id: string,
  workOrderId: string | null,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const table = kind === "quote" ? "quotes" : "invoices";
  const { error } = await tbl(supabase, table)
    .update({ work_order_id: workOrderId })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  if (workOrderId) revalidatePath(`/work-orders/${workOrderId}`);
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

// ── Share link (customer-facing portfolio) ───────────────────────────────────

export async function enableWorkOrderShareLink(id: string): Promise<{ token: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: existing } = await tbl(supabase, "work_orders")
    .select("share_token").eq("id", id).eq("business_id", businessId).single();
  if (existing?.share_token) return { token: existing.share_token };

  const token = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const { error } = await tbl(supabase, "work_orders")
    .update({ share_token: token, share_enabled_at: new Date().toISOString() })
    .eq("id", id).eq("business_id", businessId);
  if (error) throw error;

  await logJobEvent({ workOrderId: id, type: "note_added", payload: { message: "Customer share link enabled" }, visibleToCustomer: false });
  revalidatePath(`/work-orders/${id}`);
  return { token };
}

export async function disableWorkOrderShareLink(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "work_orders")
    .update({ share_token: null, share_enabled_at: null })
    .eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  await logJobEvent({ workOrderId: id, type: "note_added", payload: { message: "Customer share link revoked" }, visibleToCustomer: false });
  revalidatePath(`/work-orders/${id}`);
}

// ── Invoice unbilled time + materials ────────────────────────────────────────

export async function invoiceUnbilledForWorkOrder(
  workOrderId: string,
  options: { hourly_rate?: number; include_travel?: boolean; due_in_days?: number } = {},
): Promise<{ invoice_id: string; invoice_number: string; subtotal: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const hourlyRate = Math.max(0, options.hourly_rate ?? 0);
  const includeTravel = options.include_travel ?? false;
  const dueInDays = options.due_in_days ?? 14;

  const { data: wo } = await tbl(supabase, "work_orders")
    .select("id, customer_id, title, number")
    .eq("id", workOrderId).eq("business_id", businessId).single();
  if (!wo) throw new Error("Work order not found");

  const allowedTypes = includeTravel ? ["work", "travel"] : ["work"];
  const { data: timeRows } = await tbl(supabase, "job_time_entries")
    .select("id, type, duration_seconds")
    .eq("work_order_id", workOrderId).eq("business_id", businessId)
    .is("invoice_id", null).in("type", allowedTypes);

  const { data: matRows } = await tbl(supabase, "job_materials")
    .select("id, name, qty, unit, unit_price")
    .eq("work_order_id", workOrderId).eq("business_id", businessId)
    .is("invoice_id", null).eq("billable", true);

  const timeEntries = (timeRows ?? []) as Array<{ id: string; type: string; duration_seconds: number | null }>;
  const materials = (matRows ?? []) as Array<{ id: string; name: string; qty: number; unit: string | null; unit_price: number }>;

  if (timeEntries.length === 0 && materials.length === 0) {
    throw new Error("Nothing unbilled on this job");
  }

  const totalSeconds = timeEntries.reduce((s, e) => s + (e.duration_seconds ?? 0), 0);
  const totalHours = totalSeconds / 3600;

  type LI = {
    id: string; name: string; description?: string; quantity: number;
    unit_price: number; tax_rate: number; discount_percent: number;
    subtotal: number; tax_amount: number; total: number;
  };
  const lineItems: LI[] = [];

  if (totalHours > 0) {
    const qty = Math.round(totalHours * 100) / 100;
    const subtotal = Math.round(qty * hourlyRate * 100) / 100;
    lineItems.push({
      id: crypto.randomUUID(),
      name: `Labor — ${wo.title}`,
      description: `${qty.toFixed(2)} hr${includeTravel ? " (incl. travel)" : ""}`,
      quantity: qty, unit_price: hourlyRate, tax_rate: 0, discount_percent: 0,
      subtotal, tax_amount: 0, total: subtotal,
    });
  }

  for (const m of materials) {
    const subtotal = Math.round(m.qty * m.unit_price * 100) / 100;
    lineItems.push({
      id: crypto.randomUUID(),
      name: m.name,
      description: m.unit ? `${m.qty} ${m.unit}` : undefined,
      quantity: m.qty, unit_price: m.unit_price, tax_rate: 0, discount_percent: 0,
      subtotal, tax_amount: 0, total: subtotal,
    });
  }

  const subtotal = Math.round(lineItems.reduce((s, l) => s + l.total, 0) * 100) / 100;
  const issueDate = new Date().toISOString().split("T")[0];
  const dueDate = new Date(Date.now() + dueInDays * 86400000).toISOString().split("T")[0];

  // Mint invoice number (mirrors createInvoice logic)
  const { data: business } = await tbl(supabase, "businesses")
    .select("invoice_prefix, invoice_next_number").eq("id", businessId).single();
  const number = `${business?.invoice_prefix ?? "INV"}-${String(business?.invoice_next_number ?? 1).padStart(4, "0")}`;
  await tbl(supabase, "businesses")
    .update({ invoice_next_number: (business?.invoice_next_number ?? 1) + 1 })
    .eq("id", businessId);

  const { data: invoice, error: invErr } = await tbl(supabase, "invoices").insert({
    user_id: user.id, business_id: businessId, number,
    status: "draft", customer_id: wo.customer_id,
    issue_date: issueDate, due_date: dueDate,
    line_items: lineItems,
    subtotal, discount_type: null, discount_value: 0, discount_amount: 0,
    tax_total: 0, total: subtotal, amount_paid: 0,
    notes: `Auto-generated from work order ${wo.number}`,
    terms: null, work_order_id: workOrderId,
  }).select().single();
  if (invErr) throw invErr;

  // Mark sources as billed
  const now = new Date().toISOString();
  if (timeEntries.length > 0) {
    await tbl(supabase, "job_time_entries")
      .update({ invoice_id: invoice.id, invoiced_at: now })
      .in("id", timeEntries.map((e) => e.id));
  }
  if (materials.length > 0) {
    await tbl(supabase, "job_materials")
      .update({ invoice_id: invoice.id, invoiced_at: now })
      .in("id", materials.map((m) => m.id));
  }

  await logJobEvent({
    workOrderId, type: "note_added",
    payload: { message: `Invoice ${number} created from unbilled work — $${subtotal.toFixed(2)}` },
    visibleToCustomer: false,
  });

  revalidatePath(`/work-orders/${workOrderId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { invoice_id: invoice.id, invoice_number: number, subtotal };
}
