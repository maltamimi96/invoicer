import { supabase } from "./supabase";
import type { WorkOrderStatus, WorkOrderPhoto, WorkOrderWithCustomer } from "./types";

/**
 * Pull every work order the calling user can see. RLS does the heavy lifting:
 * for a `worker` role this resolves to "rows where assigned_to_profile_id
 * matches one of my member_profiles, or I'm in work_order_assignments".
 */
export async function fetchMyWorkOrders(): Promise<WorkOrderWithCustomer[]> {
  const { data, error } = await supabase
    .from("work_orders")
    .select("*, customers(id, name, company, email, phone)")
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("created_at",     { ascending: false });
  if (error) throw error;
  return (data ?? []) as WorkOrderWithCustomer[];
}

export async function fetchWorkOrder(id: string): Promise<WorkOrderWithCustomer | null> {
  const { data, error } = await supabase
    .from("work_orders")
    .select("*, customers(id, name, company, email, phone)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as WorkOrderWithCustomer | null;
}

/**
 * Update status. RLS allows worker UPDATEs only on assigned rows. We don't
 * need to set completed_at here — backend trigger does it on `completed`,
 * if not we can revisit.
 */
export async function setWorkOrderStatus(id: string, status: WorkOrderStatus): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "completed" || status === "submitted") {
    patch.completed_at = new Date().toISOString();
  }
  const { error } = await supabase.from("work_orders").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * Append a photo to the work_orders.photos JSON array. We re-read the current
 * array, push, then write back — small race risk but acceptable for one-user-
 * per-job in the field.
 */
export async function addWorkOrderPhoto(id: string, photo: WorkOrderPhoto): Promise<void> {
  const { data: current, error: readErr } = await supabase
    .from("work_orders")
    .select("photos")
    .eq("id", id)
    .single();
  if (readErr) throw readErr;

  const photos = Array.isArray(current?.photos) ? [...current.photos, photo] : [photo];
  const { error } = await supabase.from("work_orders").update({ photos }).eq("id", id);
  if (error) throw error;
}

export async function setWorkerNotes(id: string, worker_notes: string): Promise<void> {
  const { error } = await supabase.from("work_orders").update({ worker_notes }).eq("id", id);
  if (error) throw error;
}
