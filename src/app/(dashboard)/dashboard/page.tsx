import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { isWorker, type Role } from "@/lib/permissions";
import { getDashboardStats } from "@/lib/actions/invoices";
import { getBusiness } from "@/lib/actions/business";
import { getTodayWorkOrders, getWorkOrders } from "@/lib/actions/work-orders";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { WorkerDashboard } from "@/components/dashboard/worker-dashboard";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const businessId = await getActiveBizId(sb, user.id);

  // Resolve role
  const { data: biz } = await sb.from("businesses").select("user_id").eq("id", businessId).single();
  let role: Role = "owner";
  if (biz?.user_id !== user.id) {
    const { data: m } = await sb
      .from("business_members")
      .select("role")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    role = (m?.role ?? "viewer") as Role;
  }

  if (isWorker(role)) {
    const [business, todayJobs, allJobs] = await Promise.all([
      getBusiness().catch(() => null),
      getTodayWorkOrders().catch(() => []),
      getWorkOrders().catch(() => []),
    ]);
    return (
      <WorkerDashboard
        userEmail={user.email ?? ""}
        businessName={business?.name ?? "your team"}
        todayJobs={todayJobs}
        allJobs={allJobs}
      />
    );
  }

  const [stats, business, todayJobs] = await Promise.all([
    getDashboardStats(),
    getBusiness(),
    getTodayWorkOrders(),
  ]);
  return <DashboardClient stats={stats} currency={business.currency} todayJobs={todayJobs} />;
}
