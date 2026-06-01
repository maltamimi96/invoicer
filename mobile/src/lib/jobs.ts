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
 * Persist a photo for a work order. Writes to TWO places:
 *  - public.job_photos (canonical table — what the web admin / customer portal
 *    / job-share page / PDF render read from), and
 *  - work_orders.photos JSONB (legacy — still the mobile job screen's display
 *    source, kept in sync until the mobile reader moves to job_photos).
 *
 * Writing to only work_orders.photos (as before) made worker uploads invisible
 * everywhere outside the mobile app.
 */
export async function addWorkOrderPhoto(id: string, photo: WorkOrderPhoto): Promise<void> {
  const { data: current, error: readErr } = await supabase
    .from("work_orders")
    .select("business_id, photos")
    .eq("id", id)
    .single();
  if (readErr) throw readErr;

  // Canonical: insert into job_photos so web/portal/PDF see the photo.
  const { data: { user } } = await supabase.auth.getUser();
  const { error: jpErr } = await supabase.from("job_photos").insert({
    business_id: current.business_id,
    work_order_id: id,
    url: photo.url,
    taken_at: photo.taken_at ?? new Date().toISOString(),
    taken_by: user?.id ?? null,
  });
  if (jpErr) throw jpErr;

  // Legacy mirror so the mobile job screen keeps showing it without a reader change.
  const photos = Array.isArray(current?.photos) ? [...current.photos, photo] : [photo];
  const { error } = await supabase.from("work_orders").update({ photos }).eq("id", id);
  if (error) throw error;
}

export async function setWorkerNotes(id: string, worker_notes: string): Promise<void> {
  const { error } = await supabase.from("work_orders").update({ worker_notes }).eq("id", id);
  if (error) throw error;
}

/**
 * Pull booker / onsite contact records for a work order. Returns nulls if the
 * job has no per-account contact links set or RLS blocks the read.
 */
export async function fetchJobContacts(
  bookerId: string | null | undefined,
  onsiteId: string | null | undefined,
): Promise<{ booker: AccountContactRow | null; onsite: AccountContactRow | null }> {
  const ids = [bookerId, onsiteId].filter((x): x is string => !!x);
  if (ids.length === 0) return { booker: null, onsite: null };

  const { data } = await supabase
    .from("account_contacts")
    .select("id, name, email, phone, role")
    .in("id", ids);

  const rows = (data ?? []) as AccountContactRow[];
  return {
    booker: rows.find((r) => r.id === bookerId) ?? null,
    onsite: rows.find((r) => r.id === onsiteId) ?? null,
  };
}

type AccountContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
};

/**
 * Remove a single photo from the work_orders.photos JSON array. Re-reads the
 * current array, filters by url, writes back.
 */
export async function removeWorkOrderPhoto(id: string, url: string): Promise<void> {
  // Remove from the canonical job_photos table.
  await supabase.from("job_photos").delete().eq("work_order_id", id).eq("url", url);
  // And from the legacy JSONB mirror so the mobile reader stays in sync.
  const { data: current, error: readErr } = await supabase
    .from("work_orders")
    .select("photos")
    .eq("id", id)
    .single();
  if (readErr) throw readErr;
  const photos = (Array.isArray(current?.photos) ? current.photos : []).filter(
    (p: { url?: string }) => p?.url !== url,
  );
  const { error } = await supabase.from("work_orders").update({ photos }).eq("id", id);
  if (error) throw error;
}
