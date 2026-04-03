import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { canEdit } from "@/lib/permissions";
import { type Role } from "@/lib/permissions";
import { getMembers } from "@/lib/actions/members";
import { WorkOrderNewClient } from "@/components/work-orders/work-order-new-client";
import type { Customer } from "@/types/database";

export default async function NewWorkOrderPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer: defaultCustomerId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Determine role
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
  if (!canEdit(userRole)) redirect("/work-orders");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customersRaw } = await (supabase as any).from("customers").select("id, name, company, email").eq("business_id", businessId).eq("archived", false).order("name");
  const customers = (customersRaw ?? []) as Customer[];
  const members = await getMembers();

  return <WorkOrderNewClient customers={customers} members={members} ownerEmail={user.email ?? ""} defaultCustomerId={defaultCustomerId} />;
}
