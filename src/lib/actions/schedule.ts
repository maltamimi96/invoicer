"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { ScheduledJob, WorkOrderStatus } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

const JOB_SELECT = `
  *,
  customers(id, name, email, phone),
  work_order_assignments(
    id,
    member_profile_id,
    reminder_sent_at,
    member_profiles(id, name, email, phone, avatar_url, role_title)
  )
`;

export async function getScheduledJobs(startDate: string, endDate: string): Promise<ScheduledJob[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "work_orders")
    .select(JOB_SELECT)
    .eq("business_id", businessId)
    .gte("scheduled_date", startDate)
    .lte("scheduled_date", endDate)
    .not("status", "eq", "cancelled")
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as ScheduledJob[];
}

export async function createScheduledJob(payload: {
  title: string;
  scheduled_date: string;
  start_time?: string | null;
  end_time?: string | null;
  customer_id?: string | null;
  property_address?: string | null;
  description?: string | null;
  scope_of_work?: string | null;
  member_profile_ids?: string[];
}): Promise<ScheduledJob> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  // Get next work order number
  const { data: biz } = await tbl(supabase, "businesses")
    .select("work_order_prefix, work_order_next_number")
    .eq("id", businessId)
    .single();
  const prefix = biz?.work_order_prefix ?? "WO";
  const num = biz?.work_order_next_number ?? 1;
  const number = `${prefix}-${String(num).padStart(4, "0")}`;
  await tbl(supabase, "businesses")
    .update({ work_order_next_number: num + 1 })
    .eq("id", businessId);

  const { data, error } = await tbl(supabase, "work_orders")
    .insert({
      title: payload.title,
      number,
      status: "draft",
      scheduled_date: payload.scheduled_date,
      start_time: payload.start_time ?? null,
      end_time: payload.end_time ?? null,
      customer_id: payload.customer_id ?? null,
      property_address: payload.property_address ?? null,
      description: payload.description ?? null,
      scope_of_work: payload.scope_of_work ?? null,
      business_id: businessId,
      user_id: user.id,
      photos: [],
    })
    .select("id")
    .single();

  if (error) throw error;

  // Assign workers
  if (payload.member_profile_ids?.length) {
    await setJobAssignments(data.id, payload.member_profile_ids, businessId, user.id);
  }

  revalidatePath("/schedule");
  revalidatePath("/work-orders");

  const { data: full } = await tbl(supabase, "work_orders").select(JOB_SELECT).eq("id", data.id).single();
  return full as ScheduledJob;
}

export async function updateScheduledJob(id: string, updates: {
  title?: string;
  scheduled_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  customer_id?: string | null;
  property_address?: string | null;
  description?: string | null;
  scope_of_work?: string | null;
  status?: WorkOrderStatus;
  member_profile_ids?: string[];
}): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { member_profile_ids, ...fields } = updates;

  if (Object.keys(fields).length > 0) {
    const { error } = await tbl(supabase, "work_orders")
      .update(fields)
      .eq("id", id)
      .eq("business_id", businessId);
    if (error) throw error;
  }

  if (member_profile_ids !== undefined) {
    await setJobAssignments(id, member_profile_ids, businessId, user.id);
  }

  revalidatePath("/schedule");
  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
}

export async function deleteScheduledJob(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "work_orders")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;

  revalidatePath("/schedule");
  revalidatePath("/work-orders");
}

async function setJobAssignments(
  workOrderId: string,
  profileIds: string[],
  businessId: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();

  // Delete existing
  await tbl(supabase, "work_order_assignments")
    .delete()
    .eq("work_order_id", workOrderId);

  // Insert new
  if (profileIds.length > 0) {
    await tbl(supabase, "work_order_assignments")
      .insert(
        profileIds.map((pid) => ({
          work_order_id: workOrderId,
          business_id: businessId,
          member_profile_id: pid,
          assigned_by: userId,
        }))
      );
  }
}
