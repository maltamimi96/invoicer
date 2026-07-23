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
 * Read a work order's photos from the CANONICAL table.
 *
 * The job screen used to render `work_orders.photos` (the legacy JSONB). Sync
 * between the two stores only ever ran one way — trg_sync_wo_photos fires on
 * `work_orders.photos` and copies INTO job_photos — so:
 *
 *   phone uploads  → JSONB + job_photos → visible everywhere        ✅
 *   web uploads    → job_photos only    → phone never saw it        ❌
 *   web deletes    → job_photos only    → phone still showed it     ❌
 *
 * Reading from job_photos here makes the canonical table the single source of
 * truth for display, so web adds, edits and deletes all show up on the phone.
 * The JSONB is now a derived mirror maintained by trg_mirror_job_photos — no
 * client writes it, and nothing on mobile reads it.
 */
export async function fetchJobPhotos(workOrderId: string): Promise<WorkOrderPhoto[]> {
  const { data, error } = await supabase
    .from("job_photos")
    .select("id, url, caption, taken_at, created_at")
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((p) => ({
    url: p.url as string,
    caption: (p.caption as string | null) ?? undefined,
    taken_at: (p.taken_at as string | null) ?? (p.created_at as string),
  }));
}

/**
 * Persist a photo for a work order. Writes ONLY to public.job_photos — the
 * canonical table. A database trigger (trg_mirror_job_photos) rebuilds the
 * legacy work_orders.photos JSONB from it.
 *
 * This function used to also write the JSONB by reading the current array and
 * appending to it. That read-modify-write was the resurrection bug: the web
 * deletes photos from job_photos only, so the JSONB it read was stale, and the
 * old sync trigger then replayed those stale urls back INTO job_photos.
 * Deleting a photo on the web and then uploading from the phone brought every
 * deleted photo back. Never write work_orders.photos from a client again.
 */
export async function addWorkOrderPhoto(id: string, photo: WorkOrderPhoto): Promise<void> {
  const { data: current, error: readErr } = await supabase
    .from("work_orders")
    .select("business_id")
    .eq("id", id)
    .single();
  if (readErr) throw readErr;

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("job_photos").insert({
    business_id: current.business_id,
    work_order_id: id,
    url: photo.url,
    caption: photo.caption ?? null,
    taken_at: photo.taken_at ?? new Date().toISOString(),
    taken_by: user?.id ?? null,
  });
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
 * Delete a photo. Removes the canonical job_photos row; trg_mirror_job_photos
 * rebuilds work_orders.photos. The error was previously swallowed, so a delete
 * blocked by RLS looked like it had worked until the next refetch.
 */
export async function removeWorkOrderPhoto(id: string, url: string): Promise<void> {
  const { error } = await supabase
    .from("job_photos")
    .delete()
    .eq("work_order_id", id)
    .eq("url", url);
  if (error) throw error;
}
