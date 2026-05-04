"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  TrendingUp, Clock, AlertTriangle, CheckCircle, Plus, FileText,
  Wrench, MapPin, User, ArrowRight, FileCheck, UserPlus, ChevronRight,
  DollarSign,
} from "@/components/ui/icons";
import { formatCurrency, getStatusColor } from "@/lib/utils";
import type { WorkOrderWithCustomer, WorkOrderStatus } from "@/types/database";

const STATUS_TO_PILL: Record<WorkOrderStatus, string> = {
  draft:       "draft",
  assigned:    "scheduled",
  in_progress: "in-progress",
  submitted:   "pending",
  reviewed:    "pending",
  completed:   "completed",
  cancelled:   "cancelled",
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
  const router = useRouter();
  const todayStr = new Date().toISOString().split("T")[0];
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const monthly = stats.monthlyData.slice(-6);
  const maxBar  = Math.max(...monthly.map((m) => m.revenue), 1);
  const totalBilled = monthly.reduce((s, m) => s + m.revenue, 0);
  const sparkData = monthly.map((m) => m.revenue);

  const scheduledToday = todayJobs.filter((j) => j.scheduled_date === todayStr);
  const tomorrowStr = (() => {
    const t = new Date(); t.setDate(t.getDate() + 1);
    return t.toISOString().split("T")[0];
  })();
  const tomorrow = todayJobs.filter((j) => j.scheduled_date === tomorrowStr);

  // Compute deltas vs the prior month for the headline KPI
  const lastMonth = monthly[monthly.length - 2]?.revenue ?? 0;
  const thisMonth = monthly[monthly.length - 1]?.revenue ?? 0;
  const monthDelta = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;

  return (
    <div>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="ch-page-header"
      >
        <div>
          <h1 className="ch-page-title">{greeting}.</h1>
          <p className="ch-page-subtitle">Here&apos;s what&apos;s happening today.</p>
        </div>
        <div className="ch-page-actions">
          <Link href="/reports">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors">
              <TrendingUp className="w-3.5 h-3.5" /> View reports
            </button>
          </Link>
          <Link href="/invoices/new">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              <Plus className="w-3.5 h-3.5" /> New invoice
            </button>
          </Link>
        </div>
      </motion.div>

      {/* Overdue strip */}
      {stats.overdue > 0 && (
        <Link href="/invoices?status=overdue" className="block mb-5">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 hover:bg-rose-100/60 dark:hover:bg-rose-950/50 transition-colors">
            <div className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-rose-900 dark:text-rose-200 leading-tight">
                {formatCurrency(stats.overdue, currency)} overdue
              </p>
              <p className="text-xs text-rose-700/80 dark:text-rose-300/70">Send reminders to bring these in</p>
            </div>
            <ArrowRight className="w-4 h-4 text-rose-700 dark:text-rose-300" />
          </div>
        </Link>
      )}

      {/* KPI grid */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="ch-stat-grid"
      >
        <StatCard
          icon={<DollarSign className="w-3.5 h-3.5" />}
          label={`Revenue (${monthly[monthly.length - 1]?.month ?? "this month"})`}
          value={fmtShort(thisMonth, currency)}
          delta={Math.round(monthDelta * 10) / 10}
          sub="vs last month"
          spark={sparkData}
        />
        <StatCard
          icon={<Clock className="w-3.5 h-3.5" />}
          label="Outstanding"
          value={fmtShort(stats.outstanding, currency)}
          sub={`${stats.recentInvoices.length} recent invoices`}
        />
        <StatCard
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          label="Overdue"
          value={fmtShort(stats.overdue, currency)}
          sub={stats.overdue > 0 ? "needs follow-up" : "all clear"}
        />
        <StatCard
          icon={<CheckCircle className="w-3.5 h-3.5" />}
          label="Paid this month"
          value={fmtShort(stats.paidThisMonth, currency)}
          sub="settled invoices"
        />
      </motion.div>

      {/* 2-col layout */}
      <div className="ch-grid-2">
        {/* LEFT */}
        <div className="flex flex-col gap-4">
          {/* Revenue, last 6 months */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <h3 className="text-sm font-semibold">Revenue, last 6 months</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Paid invoices, trailing</p>
              </div>
            </div>
            <div className="p-4">
              <div className="ch-bars">
                {monthly.map((m) => (
                  <div key={m.month} className="ch-bar-col">
                    <div
                      className="ch-bar primary"
                      style={{ height: `${(m.revenue / maxBar) * 100}%` }}
                      title={formatCurrency(m.revenue, currency)}
                    />
                    <div className="ch-bar-label">{m.month}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">Total billed</span>
                <span className="text-sm font-semibold ch-mono">{formatCurrency(totalBilled, currency)}</span>
              </div>
            </div>
          </div>

          {/* Recent invoices */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">Recent invoices</h3>
              <Link href="/invoices" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {stats.recentInvoices.length === 0 ? (
              <div className="ch-empty">
                <h4>No invoices yet</h4>
                <p>Create your first invoice to get started.</p>
                <Link href="/invoices/new">
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">
                    <Plus className="w-3 h-3" /> New invoice
                  </button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="ch-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Issued</th>
                      <th>Status</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentInvoices.slice(0, 5).map((inv, i) => (
                      <tr
                        key={inv.id ?? i}
                        className={inv.id ? "" : "cursor-default"}
                        onClick={() => { if (inv.id) router.push(`/invoices/${inv.id}`); }}
                      >
                        <td><span className="ref">{inv.number ?? "—"}</span></td>
                        <td>{inv.customers?.name ?? "—"}</td>
                        <td className="text-muted-foreground">{inv.issue_date ?? inv.due_date ?? ""}</td>
                        <td><span className={`ch-pill ${statusForPill(inv.status)}`}>{inv.status}</span></td>
                        <td className="num font-semibold">{formatCurrency(inv.total ?? 0, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-4">
          {/* Quick actions */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">Quick actions</h3>
            </div>
            <div className="p-4">
              <div className="ch-quick-actions">
                <QuickAction href="/invoices/new" icon={<FileText className="w-4 h-4" />} label="New invoice" meta="Bill a customer" />
                <QuickAction href="/quotes/new"   icon={<FileCheck className="w-4 h-4" />} label="New quote"   meta="Send an estimate" />
                <QuickAction href="/work-orders/new" icon={<Wrench className="w-4 h-4" />} label="Work order"  meta="Schedule a job" />
                <QuickAction href="/customers/new"   icon={<UserPlus className="w-4 h-4" />} label="Add customer" meta="New contact" />
              </div>
            </div>
          </div>

          {/* Today's schedule */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <h3 className="text-sm font-semibold">Today&apos;s schedule</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</p>
              </div>
              <Link href="/work-orders" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                All jobs <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="p-2">
              {scheduledToday.length === 0 ? (
                <div className="ch-empty"><h4>Nothing scheduled today</h4><p>Add a work order to fill your day.</p></div>
              ) : (
                scheduledToday.slice(0, 6).map((wo) => <ScheduleRow key={wo.id} wo={wo} />)
              )}
              {tomorrow.length > 0 && (
                <>
                  <div className="border-t border-border my-2" />
                  <div className="ch-schedule-day px-1">Tomorrow</div>
                  {tomorrow.slice(0, 3).map((wo) => <ScheduleRow key={wo.id} wo={wo} />)}
                </>
              )}
            </div>
          </div>

          {/* Activity */}
          {stats.recentInvoices.length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold">Activity</h3>
              </div>
              <div className="p-2">
                {stats.recentInvoices.slice(0, 5).map((inv, i) => {
                  const inner = (
                    <div className="ch-activity-item">
                      <div className="ch-activity-icon">
                        <FileText className="w-3.5 h-3.5" />
                      </div>
                      <div className="ch-activity-content">
                        <div>
                          Invoice <span className="font-semibold">{inv.number}</span> {inv.status === "paid" ? "paid" : "sent"}
                          {" "}<span className="ch-mono font-semibold">· {formatCurrency(inv.total ?? 0, currency)}</span>
                        </div>
                        <div className="ch-activity-meta">{inv.customers?.name ?? "No client"}</div>
                      </div>
                    </div>
                  );
                  return inv.id
                    ? <Link key={inv.id} href={`/invoices/${inv.id}`}>{inner}</Link>
                    : <div key={i}>{inner}</div>;
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function statusForPill(status?: string) {
  if (!status) return "draft";
  return getStatusColor(status).includes("green") ? "paid"
       : getStatusColor(status).includes("yellow") ? "pending"
       : status; // pass through; matches our .ch-pill.* classes
}

function StatCard({
  icon, label, value, delta, sub, spark,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: number;
  sub: string;
  spark?: number[];
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="ch-stat">
      <div className="ch-stat-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="ch-stat-value">{value}</div>
        {spark && spark.length > 1 && <Sparkline data={spark} />}
      </div>
      <div className="ch-stat-meta">
        {delta != null && (
          <>
            <TrendingUp className={`w-3 h-3 ${up ? "text-emerald-600" : "text-rose-600 rotate-180"}`} />
            <span className={`ch-stat-delta ${up ? "up" : "down"}`}>{up ? "+" : ""}{delta}%</span>
          </>
        )}
        <span>{sub}</span>
      </div>
    </div>
  );
}

function Sparkline({ data, width = 96, height = 28 }: { data: number[]; width?: number; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const fillD = d + ` L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} className="block">
      <path d={fillD} className="ch-spark-fill" />
      <path d={d} className="ch-spark" />
    </svg>
  );
}

function QuickAction({ href, icon, label, meta }: { href: string; icon: React.ReactNode; label: string; meta: string }) {
  return (
    <Link href={href}>
      <button className="ch-quick-action">
        <div className="ch-quick-action-icon">{icon}</div>
        <div className="min-w-0">
          <div>{label}</div>
          <div className="ch-quick-action-meta">{meta}</div>
        </div>
      </button>
    </Link>
  );
}

function ScheduleRow({ wo }: { wo: WorkOrderWithCustomer }) {
  const time = wo.start_time ? wo.start_time.slice(0, 5) : "—";
  const barColor =
    wo.status === "in_progress" ? "hsl(35 75% 50%)" :
    wo.status === "submitted"   ? "hsl(280 50% 55%)" :
    "hsl(var(--primary))";
  return (
    <Link href={`/work-orders/${wo.id}`} className="block">
      <div className="ch-schedule-item">
        <div className="ch-schedule-time">{time}</div>
        <div className="ch-schedule-bar" style={{ background: barColor }} />
        <div className="ch-schedule-content">
          <div className="ch-schedule-title">{wo.customers?.name ?? wo.title}</div>
          <div className="ch-schedule-meta truncate">
            <span className="inline-flex items-center gap-1">
              <MapPin className="inline w-3 h-3" />{wo.property_address ?? "—"}
            </span>
            {wo.assigned_to_email && (
              <span className="ml-2 inline-flex items-center gap-1">
                <User className="inline w-3 h-3" />{wo.assigned_to_email}
              </span>
            )}
          </div>
        </div>
        <span className={`ch-pill ${STATUS_TO_PILL[wo.status]}`}>{wo.status.replace("_", " ")}</span>
      </div>
    </Link>
  );
}
