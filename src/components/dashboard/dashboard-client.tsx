"use client";

import Link from "next/link";
import {
  TrendingUp, Clock, AlertTriangle, CheckCircle, Plus, FileText,
  Wrench, MapPin, User, ArrowRight, FileCheck, UserPlus, ChevronRight,
  DollarSign, Calendar, Briefcase,
} from "@/components/ui/icons";
import { formatCurrency } from "@/lib/utils";
import { BriefingWidget } from "@/components/briefing/briefing-widget";
import { TasksWidget } from "@/components/tasks/tasks-widget";
import { OutlookWidget } from "@/components/dashboard/outlook-widget";
import { NewLeadsWidget } from "@/components/dashboard/new-leads-widget";
import {
  FadeIn, HubTile, StatTile, CardListRow, AnimatedPress, GradientTile,
} from "@/components/ui/kirei";
import type { WorkOrderWithCustomer, WorkOrderStatus } from "@/types/database";
import type { GradientName } from "@/components/ui/kirei";

const STATUS_PILL_TEXT: Record<WorkOrderStatus, string> = {
  draft: "Draft", assigned: "Assigned", in_progress: "In progress",
  submitted: "Submitted", reviewed: "Reviewed", completed: "Completed", cancelled: "Cancelled",
};

const STATUS_PILL_TONE: Record<WorkOrderStatus, string> = {
  draft:       "bg-muted text-muted-foreground",
  assigned:    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  in_progress: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  submitted:   "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200",
  reviewed:    "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200",
  completed:   "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  cancelled:   "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
};

interface DashboardClientProps {
  todayJobs: WorkOrderWithCustomer[];
  stats: {
    totalRevenue: number;
    outstanding: number;
    overdue: number;
    paidThisMonth: number;
    recentInvoices: Array<{
      id?: string;
      number?: string;
      status?: string;
      total?: number;
      due_date?: string;
      issue_date?: string;
      customers?: { name?: string } | null;
    }>;
    monthlyData: Array<{ month: string; revenue: number; invoiced: number }>;
  };
  currency?: string;
}

function fmtShort(n: number, currency: string) {
  if (Math.abs(n) >= 1000) {
    return (n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }).replace(/\.0$/, "") + "k " + currency;
  }
  return formatCurrency(n, currency);
}

export function DashboardClient({ stats, currency = "GBP", todayJobs }: DashboardClientProps) {
  const todayStr = new Date().toISOString().split("T")[0];
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const monthly = stats.monthlyData.slice(-6);
  const maxBar  = Math.max(...monthly.map((m) => m.revenue), 1);
  const totalBilled = monthly.reduce((s, m) => s + m.revenue, 0);

  const scheduledToday = todayJobs.filter((j) => j.scheduled_date === todayStr);
  const tomorrowStr = (() => {
    const t = new Date(); t.setDate(t.getDate() + 1);
    return t.toISOString().split("T")[0];
  })();
  const tomorrow = todayJobs.filter((j) => j.scheduled_date === tomorrowStr);

  const lastMonth = monthly[monthly.length - 2]?.revenue ?? 0;
  const thisMonth = monthly[monthly.length - 1]?.revenue ?? 0;
  const monthDelta = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* ── Greeting + primary CTA ─────────────────────────────────────────── */}
      <FadeIn>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{greeting}.</h1>
            <p className="text-sm text-muted-foreground mt-1">Here&apos;s what&apos;s happening today.</p>
          </div>
          <Link href="/invoices/new">
            <AnimatedPress className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm">
              <Plus className="w-4 h-4" /> New invoice
            </AnimatedPress>
          </Link>
        </div>
      </FadeIn>

      {/* ── Overdue alert strip ────────────────────────────────────────────── */}
      {stats.overdue > 0 && (
        <FadeIn delay={60}>
          <Link href="/invoices?status=overdue" className="block">
            <AnimatedPress className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40">
              <GradientTile gradient="rose" size={40} radius={10}>
                <AlertTriangle className="w-4 h-4" />
              </GradientTile>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-rose-900 dark:text-rose-200 leading-tight">
                  {formatCurrency(stats.overdue, currency)} overdue
                </p>
                <p className="text-xs text-rose-700/80 dark:text-rose-300/70">Send reminders to bring these in</p>
              </div>
              <ArrowRight className="w-4 h-4 text-rose-700 dark:text-rose-300 shrink-0" />
            </AnimatedPress>
          </Link>
        </FadeIn>
      )}

      {/* ── KPI tiles (gradient-tinted) ────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { gradient: "softTeal"   as GradientName, tone: "#1f4f4a", icon: <DollarSign className="w-3.5 h-3.5" />,
            label: `Revenue (${monthly[monthly.length - 1]?.month ?? "this month"})`,
            value: fmtShort(thisMonth, currency),
            sub:   monthDelta !== 0 ? `${monthDelta >= 0 ? "+" : ""}${Math.round(monthDelta * 10) / 10}% vs last month` : "vs last month" },
          { gradient: "softBlue"   as GradientName, tone: "#1e3a8a", icon: <Clock className="w-3.5 h-3.5" />,
            label: "Outstanding", value: fmtShort(stats.outstanding, currency),
            sub: `${stats.recentInvoices.length} recent invoices`, href: "/invoices?status=pending" },
          { gradient: "softRose"   as GradientName, tone: "#9f1239", icon: <AlertTriangle className="w-3.5 h-3.5" />,
            label: "Overdue", value: fmtShort(stats.overdue, currency),
            sub: stats.overdue > 0 ? "needs follow-up" : "all clear",
            href: stats.overdue > 0 ? "/invoices?status=overdue" : undefined },
          { gradient: "softAmber"  as GradientName, tone: "#78350f", icon: <CheckCircle className="w-3.5 h-3.5" />,
            label: "Paid this month", value: fmtShort(stats.paidThisMonth, currency),
            sub: "settled invoices" },
        ].map((t, i) => (
          <FadeIn key={t.label} delay={120 + i * 50}>
            <StatTile {...t} toneColor={t.tone} />
          </FadeIn>
        ))}
      </div>

      {/* ── Quick actions (mobile-style hub tiles) ─────────────────────────── */}
      <FadeIn delay={320}>
        <div>
          <h2 className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground mb-2">Quick actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <HubTile href="/invoices/new"    gradient="emerald" icon={<FileText  className="w-5 h-5" />} label="New invoice"  hint="Bill a customer" />
            <HubTile href="/quotes/new"      gradient="violet"  icon={<FileCheck className="w-5 h-5" />} label="New quote"    hint="Send an estimate" />
            <HubTile href="/work-orders/new" gradient="blue"    icon={<Wrench    className="w-5 h-5" />} label="Work order"   hint="Schedule a job" />
            <HubTile href="/customers/new"   gradient="primary" icon={<UserPlus  className="w-5 h-5" />} label="Add customer" hint="New contact" />
          </div>
        </div>
      </FadeIn>

      {/* ── 2-col content area ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        {/* LEFT: revenue + briefing + recent invoices */}
        <div className="flex flex-col gap-5">
          <FadeIn delay={380}><BriefingWidget compact /></FadeIn>

          {/* Revenue chart card */}
          <FadeIn delay={440}>
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div>
                  <h3 className="text-sm font-semibold">Revenue, last 6 months</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Paid invoices, trailing</p>
                </div>
                <GradientTile gradient="primary" size={32} radius={8}>
                  <TrendingUp className="w-4 h-4" />
                </GradientTile>
              </div>
              <div className="p-5">
                <div className="flex items-end justify-between gap-2 h-32">
                  {monthly.map((m) => {
                    const pct = (m.revenue / maxBar) * 100;
                    return (
                      <div key={m.month} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                        <div className="w-full flex items-end justify-center h-full">
                          <div
                            className="w-full max-w-[28px] rounded-md"
                            style={{
                              height: `${Math.max(pct, 4)}%`,
                              backgroundImage: "linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)",
                            }}
                            title={formatCurrency(m.revenue, currency)}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{m.month}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between pt-4 mt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">Total billed</span>
                  <span className="text-sm font-semibold tabular-nums">{formatCurrency(totalBilled, currency)}</span>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* Recent invoices — card list, no table */}
          <FadeIn delay={500}>
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold">Recent invoices</h3>
                <Link href="/invoices" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  View all <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              {stats.recentInvoices.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm font-medium">No invoices yet</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Create your first invoice to get started.</p>
                  <Link href="/invoices/new">
                    <AnimatedPress className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium">
                      <Plus className="w-3 h-3" /> New invoice
                    </AnimatedPress>
                  </Link>
                </div>
              ) : (
                <div className="p-2 space-y-1.5">
                  {stats.recentInvoices.slice(0, 5).map((inv, i) => (
                    <CardListRow
                      key={inv.id ?? i}
                      href={inv.id ? `/invoices/${inv.id}` : undefined}
                      gradient={inv.status === "paid" ? "emerald" : inv.status === "overdue" ? "rose" : "primary"}
                      icon={<FileText className="w-4 h-4" />}
                      title={<><span className="font-mono text-xs text-muted-foreground mr-2">{inv.number}</span>{inv.customers?.name ?? "—"}</>}
                      meta={inv.issue_date ?? inv.due_date ?? ""}
                      trailing={formatCurrency(inv.total ?? 0, currency)}
                    />
                  ))}
                </div>
              )}
            </div>
          </FadeIn>
        </div>

        {/* RIGHT: schedule + leads + tasks + outlook */}
        <div className="flex flex-col gap-5">
          {/* Today's schedule */}
          <FadeIn delay={420}>
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <GradientTile gradient="amber" size={32} radius={8}>
                    <Calendar className="w-4 h-4" />
                  </GradientTile>
                  <div>
                    <h3 className="text-sm font-semibold">Today&apos;s schedule</h3>
                    <p className="text-xs text-muted-foreground">{now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</p>
                  </div>
                </div>
                <Link href="/work-orders" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  All jobs <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="p-2 space-y-1.5">
                {scheduledToday.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-sm font-medium">Nothing scheduled today</p>
                    <p className="text-xs text-muted-foreground mt-1">Add a work order to fill your day.</p>
                  </div>
                ) : (
                  scheduledToday.slice(0, 6).map((wo) => <ScheduleCard key={wo.id} wo={wo} />)
                )}
                {tomorrow.length > 0 && (
                  <>
                    <div className="border-t border-border my-2" />
                    <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground px-2 pb-1">Tomorrow</div>
                    {tomorrow.slice(0, 3).map((wo) => <ScheduleCard key={wo.id} wo={wo} />)}
                  </>
                )}
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={480}><NewLeadsWidget /></FadeIn>
          <FadeIn delay={540}><TasksWidget /></FadeIn>
          <FadeIn delay={600}><OutlookWidget /></FadeIn>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ScheduleCard({ wo }: { wo: WorkOrderWithCustomer }) {
  const time = wo.start_time ? wo.start_time.slice(0, 5) : "—";
  const status = (wo.status ?? "draft") as WorkOrderStatus;
  const gradient: GradientName =
    status === "in_progress" ? "amber" :
    status === "submitted"   ? "violet" :
    status === "completed"   ? "emerald" :
    "primary";

  return (
    <Link href={`/work-orders/${wo.id}`} className="block">
      <AnimatedPress className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/70 hover:border-primary/30 transition-colors">
        <GradientTile gradient={gradient} size={40} radius={10}>
          <Briefcase className="w-4 h-4" />
        </GradientTile>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-foreground tabular-nums">{time}</span>
            <span className="text-sm font-medium text-foreground truncate">{wo.customers?.name ?? wo.title}</span>
          </div>
          <div className="text-xs text-muted-foreground truncate flex items-center gap-3 mt-0.5">
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />{wo.property_address ?? "—"}
            </span>
            {wo.assigned_to_email && (
              <span className="inline-flex items-center gap-1">
                <User className="w-3 h-3" />{wo.assigned_to_email}
              </span>
            )}
          </div>
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_PILL_TONE[status]} shrink-0`}>
          {STATUS_PILL_TEXT[status]}
        </span>
      </AnimatedPress>
    </Link>
  );
}
