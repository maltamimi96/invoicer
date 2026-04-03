import { getDashboardStats } from "@/lib/actions/invoices";
import { getBusiness } from "@/lib/actions/business";
import { getTodayWorkOrders } from "@/lib/actions/work-orders";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function DashboardPage() {
  const [stats, business, todayJobs] = await Promise.all([
    getDashboardStats(),
    getBusiness(),
    getTodayWorkOrders(),
  ]);
  return <DashboardClient stats={stats} currency={business.currency} todayJobs={todayJobs} />;
}
