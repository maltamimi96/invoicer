import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { type Role } from "@/lib/permissions";
import { getWorkOrder } from "@/lib/actions/work-orders";
import { getWorkOrderUpdates } from "@/lib/actions/work-order-updates";
import { WorkOrderDetailClient } from "@/components/work-orders/work-order-detail-client";
import type { Customer, MemberProfile } from "@/types/database";

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any).from("businesses").select("user_id").eq("id", businessId).single();
  let userRole: Role = "owner";
  if (biz?.user_id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: m } = await (supabase as any).from("business_members").select("role").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    userRole = (m?.role ?? "viewer") as Role;
  }

  try {
    const workOrder = await getWorkOrder(id);

    const [customersRaw, updates, assignmentsRaw] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("customers").select("id, name, company, email").eq("business_id", businessId).eq("archived", false).order("name").then((r: { data: unknown[] | null }) => r.data ?? []),
      getWorkOrderUpdates(id).catch(() => []),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("work_order_assignments")
        .select("member_profile_id, member_profiles(id, name, email, avatar_url, role_title)")
        .eq("work_order_id", id)
        .then((r: { data: unknown[] | null }) => r.data ?? []),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignedWorkers = (assignmentsRaw as any[]).map((a) => a.member_profiles).filter(Boolean) as Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'>[];

    // Fallback: if no assignments found but legacy assigned_to_profile_id is set, fetch that profile
    let legacyProfile: Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'> | null = null;
    if (assignedWorkers.length === 0 && workOrder.assigned_to_profile_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("member_profiles").select("id, name, email, avatar_url, role_title").eq("id", workOrder.assigned_to_profile_id).single();
      legacyProfile = data;
    }

    const allWorkers = assignedWorkers.length > 0 ? assignedWorkers : (legacyProfile ? [legacyProfile] : []);

    return (
      <WorkOrderDetailClient
        workOrder={workOrder}
        customers={customersRaw as Customer[]}
        userRole={userRole}
        currentUserId={user.id}
        currentUserEmail={user.email ?? ""}
        updates={updates}
        assignedWorkers={allWorkers}
      />
    );
  } catch {
    notFound();
  }
}
