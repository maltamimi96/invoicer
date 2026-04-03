"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { canManageTeam } from "@/lib/permissions";
import type { WorkOrderUpdate, WorkOrderUpdatePhoto } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

export async function getWorkOrderUpdates(workOrderId: string): Promise<WorkOrderUpdate[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "work_order_updates")
    .select("*")
    .eq("work_order_id", workOrderId)
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as WorkOrderUpdate[];
}

export async function addWorkOrderUpdate(
  workOrderId: string,
  payload: { content: string; photos: WorkOrderUpdatePhoto[] }
): Promise<WorkOrderUpdate> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  // Verify work order belongs to this business
  const { data: wo, error: woErr } = await tbl(supabase, "work_orders")
    .select("id, status, assigned_to_email, assigned_to_profile_id")
    .eq("id", workOrderId)
    .eq("business_id", businessId)
    .single();
  if (woErr || !wo) throw new Error("Work order not found");

  // Check permission: owner/admin can always add; editor must be the assigned worker
  const { data: biz } = await tbl(supabase, "businesses").select("user_id").eq("id", businessId).single();
  const isOwnerUser = biz?.user_id === user.id;

  if (!isOwnerUser) {
    const { data: member } = await tbl(supabase, "business_members")
      .select("role").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    const role = member?.role ?? "viewer";

    if (!canManageTeam(role)) {
      // Editor: must be the assigned worker (check by email or linked profile)
      const isAssignedByEmail = wo.assigned_to_email === user.email;
      let isAssignedByProfile = false;
      if (wo.assigned_to_profile_id) {
        const { data: profile } = await tbl(supabase, "member_profiles")
          .select("user_id").eq("id", wo.assigned_to_profile_id).single();
        isAssignedByProfile = profile?.user_id === user.id;
      }
      if (!isAssignedByEmail && !isAssignedByProfile) {
        throw new Error("You are not assigned to this work order");
      }
    }
  }

  // Resolve author name from member profile or user metadata
  let authorName = user.user_metadata?.full_name ?? user.email ?? "Unknown";
  const { data: profile } = await tbl(supabase, "member_profiles")
    .select("name").eq("business_id", businessId).eq("email", user.email).maybeSingle();
  if (profile?.name) authorName = profile.name;

  const { data, error } = await tbl(supabase, "work_order_updates").insert({
    work_order_id: workOrderId,
    business_id: businessId,
    author_user_id: user.id,
    author_email: user.email ?? "",
    author_name: authorName,
    content: payload.content,
    photos: payload.photos,
  }).select().single();

  if (error) throw error;

  // Auto-advance to in_progress if still at assigned
  if (wo.status === "assigned") {
    await tbl(supabase, "work_orders")
      .update({ status: "in_progress" })
      .eq("id", workOrderId)
      .eq("business_id", businessId);
  }

  revalidatePath(`/work-orders/${workOrderId}`);
  return data as WorkOrderUpdate;
}

export async function deleteWorkOrderUpdate(updateId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  // Get update to access photos for storage cleanup + validate access
  const { data: update, error: fetchErr } = await tbl(supabase, "work_order_updates")
    .select("*").eq("id", updateId).eq("business_id", businessId).single();
  if (fetchErr || !update) throw new Error("Update not found");

  // Owner/admin only
  const { data: biz } = await tbl(supabase, "businesses").select("user_id").eq("id", businessId).single();
  if (biz?.user_id !== user.id) {
    const { data: member } = await tbl(supabase, "business_members")
      .select("role").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (member?.role !== "admin") throw new Error("Only owners and admins can delete updates");
  }

  // Best-effort storage cleanup
  const photos: WorkOrderUpdatePhoto[] = update.photos ?? [];
  if (photos.length > 0) {
    try {
      await supabase.storage
        .from("work-order-photos")
        .remove(photos.map((p) => p.storagePath));
    } catch {
      // Non-fatal
    }
  }

  const { error } = await tbl(supabase, "work_order_updates")
    .delete().eq("id", updateId).eq("business_id", businessId);
  if (error) throw error;

  revalidatePath(`/work-orders/${update.work_order_id}`);
}
