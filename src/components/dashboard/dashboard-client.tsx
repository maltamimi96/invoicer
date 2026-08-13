"use client";

/**
 * The owner/admin dashboard.
 *
 * The overview itself is the Kirei Dashboard v2 design (see
 * ./v2/dashboard-v2.tsx). This file is the composition: the redesigned
 * overview, then the widgets that were already here.
 *
 * The widgets are kept deliberately. The mock never included briefing, tasks,
 * outlook or new leads — but removing working features to match a mock that
 * simply didn't draw them would be a loss of function dressed up as a
 * redesign. They sit below the overview instead.
 */

import Link from "next/link";
import { UserPlus, Plus } from "@/components/ui/icons";
import { BriefingWidget } from "@/components/briefing/briefing-widget";
import { TasksWidget } from "@/components/tasks/tasks-widget";
import { OutlookWidget } from "@/components/dashboard/outlook-widget";
import { NewLeadsWidget } from "@/components/dashboard/new-leads-widget";
import { DashboardV2, type DashboardV2Stats } from "@/components/dashboard/v2/dashboard-v2";
import type { WorkOrderWithCustomer } from "@/types/database";

interface DashboardClientProps {
  todayJobs: WorkOrderWithCustomer[];
  stats: DashboardV2Stats;
  currency?: string;
}

export function DashboardClient({ stats, currency = "GBP", todayJobs }: DashboardClientProps) {
  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? "Late night" : hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  return (
    <div className="space-y-6">
      <DashboardV2 stats={stats} currency={currency} todayJobs={todayJobs} greeting={greeting} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BriefingWidget />
        <TasksWidget />
        <OutlookWidget />
        <NewLeadsWidget />
      </div>

      {/* Two destinations the old overview offered that the v2 layout has no
          slot for. Kept as a footer row rather than dropped - "add a client"
          was one click from the dashboard and should stay that way. */}
      <div className="flex flex-wrap gap-3">
        <Link href="/customers/new"
          className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:border-border-strong">
          <UserPlus className="h-4 w-4 text-accent-2" /> New client
        </Link>
        {/* /leads/new does not exist. It fell through to /leads/[id] with
            id="new", which reached Postgres as a uuid and raised 22P02 — so the
            dashboard's own "New lead" button crashed the page it landed on.
            /leads carries the create affordance. */}
        <Link href="/leads"
          className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:border-border-strong">
          <Plus className="h-4 w-4 text-lime" /> New lead
        </Link>
      </div>
    </div>
  );
}
