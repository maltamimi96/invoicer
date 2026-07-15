import { redirect } from "next/navigation";
import { getUserOrNull } from "@/lib/auth";
import { getMyRoleCached } from "@/lib/role";
import { isWorker } from "@/lib/permissions";
import { getDashboardStats } from "@/lib/actions/invoices";
import { getBusiness } from "@/lib/actions/business";
import { getTodayWorkOrders, getWorkOrders } from "@/lib/actions/work-orders";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { WorkerDashboard } from "@/components/dashboard/worker-dashboard";

export default async function DashboardPage() {
  // getUserOrNull shares the layout's cached GoTrue call; getMyRoleCached
  // shares role resolution instead of re-querying businesses/members here.
  const user = await getUserOrNull();
  if (!user) redirect("/auth/login");

  const role = await getMyRoleCached();

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
