import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUserOrNull } from "@/lib/auth";
import { getMyRoleCached } from "@/lib/role";
import { isWorker } from "@/lib/permissions";
import { getDashboardStats } from "@/lib/actions/invoices";
import { getBusiness } from "@/lib/actions/business";
import { getTodayWorkOrders, getWorkOrders } from "@/lib/actions/work-orders";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { WorkerDashboard } from "@/components/dashboard/worker-dashboard";
import Skeleton from "../loading";

export default async function DashboardPage() {
  // Auth-gate synchronously (cheap: shares the layout's cached GoTrue call),
  // then stream the data-dependent content behind Suspense so the shell +
  // skeleton reach the browser before the stats queries settle.
  const user = await getUserOrNull();
  if (!user) redirect("/auth/login");

  return (
    <Suspense fallback={<Skeleton />}>
      <DashboardContent userEmail={user.email ?? ""} />
    </Suspense>
  );
}

async function DashboardContent({ userEmail }: { userEmail: string }) {
  const role = await getMyRoleCached();

  if (isWorker(role)) {
    const [business, todayJobs, allJobs] = await Promise.all([
      getBusiness().catch(() => null),
      getTodayWorkOrders().catch(() => []),
      getWorkOrders().catch(() => []),
    ]);
    return (
      <WorkerDashboard
        userEmail={userEmail}
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
