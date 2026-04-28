"use client";

import { motion, type Variants } from "framer-motion";
import {
  TrendingUp, Clock, AlertTriangle, CheckCircle, Plus, FileText,
  Wrench, MapPin, User, ArrowRight, FileCheck, UserPlus, Sparkles,
} from "@/components/ui/icons";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, getStatusColor } from "@/lib/utils";
import { RevenueChart } from "./revenue-chart";
import { AnimatedCounter } from "./animated-counter";
import type { WorkOrderWithCustomer, WorkOrderStatus } from "@/types/database";

const JOB_STATUS_STYLES: Record<WorkOrderStatus, string> = {
  draft:       "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  assigned:    "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  in_progress: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  submitted:   "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  reviewed:    "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300",
  completed:   "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  cancelled:   "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
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
      customers?: { name?: string } | null;
    }>;
    monthlyData: Array<{ month: string; revenue: number; invoiced: number }>;
  };
  currency?: string;
}

export function DashboardClient({ stats, currency = "GBP", todayJobs }: DashboardClientProps) {
  const todayStr  = new Date().toISOString().split("T")[0];
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  const scheduledToday = todayJobs.filter((j) => j.scheduled_date === todayStr);
  const activeOther    = todayJobs.filter((j) => ["in_progress", "submitted"].includes(j.status) && j.scheduled_date !== todayStr);
  const onSite         = todayJobs.filter((j) => j.status === "in_progress");
  const needsReview    = todayJobs.filter((j) => j.status === "submitted");

  const kpis = [
    { label: "Total revenue",   value: stats.totalRevenue,   icon: TrendingUp,    accent: "text-emerald-600 dark:text-emerald-400", href: "/invoices?status=paid" },
    { label: "Outstanding",     value: stats.outstanding,    icon: Clock,         accent: "text-blue-600 dark:text-blue-400",       href: "/invoices" },
    { label: "Overdue",         value: stats.overdue,        icon: AlertTriangle, accent: "text-rose-600 dark:text-rose-400",       href: "/invoices?status=overdue" },
    { label: "Paid this month", value: stats.paidThisMonth,  icon: CheckCircle,   accent: "text-violet-600 dark:text-violet-400",   href: "/invoices?status=paid" },
  ];

  return (
    <div className="max-w-[1400px] mx-auto">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/40 px-6 py-8 sm:px-10 sm:py-10 mb-8"
      >
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[hsl(var(--accent)/0.15)] blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/5 text-[11px] font-medium text-foreground/70">
                <Sparkles className="w-3 h-3" /> {todayLabel}
              </span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-medium tracking-tight leading-[1.05]">
              {greeting}.
            </h1>
            <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl">
              {scheduledToday.length === 0
                ? "Nothing scheduled today — a clean slate to plan ahead or tidy up admin."
                : `You have ${scheduledToday.length} ${scheduledToday.length === 1 ? "job" : "jobs"} scheduled${onSite.length ? `, ${onSite.length} on site right now` : ""}.`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <QuickAction href="/work-orders/new" icon={Wrench} label="New job" />
            <QuickAction href="/quotes/new" icon={FileCheck} label="New quote" />
            <Link href="/invoices/new" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" /> New invoice
            </Link>
          </div>
        </div>
      </motion.section>

      {/* ── Overdue alert ────────────────────────────────────────────────── */}
      {stats.overdue > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="mb-8"
        >
          <Link href="/invoices?status=overdue" className="group flex items-center gap-4 p-4 sm:p-5 rounded-xl border border-rose-200/60 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20 hover:border-rose-300 dark:hover:border-rose-800 transition-colors">
            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4.5 h-4.5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-xl sm:text-2xl font-medium text-rose-900 dark:text-rose-200 leading-tight">
                {formatCurrency(stats.overdue, currency)} overdue
              </p>
              <p className="text-xs sm:text-sm text-rose-700/70 dark:text-rose-300/60 mt-0.5">
                Send reminders to bring these in
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-rose-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform flex-shrink-0" />
          </Link>
        </motion.div>
      )}

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      <motion.section
        variants={stagger} initial="hidden" animate="show"
        className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border/60 rounded-2xl overflow-hidden border border-border/60 mb-8"
      >
        {kpis.map((card) => (
          <motion.div key={card.label} variants={fadeUp}>
            <Link href={card.href} className="group block bg-background hover:bg-muted/40 transition-colors p-5 sm:p-6 h-full">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{card.label}</span>
                <card.icon className={`w-3.5 h-3.5 ${card.accent}`} />
              </div>
              <div className="font-display text-2xl sm:text-3xl font-medium tracking-tight tabular-nums leading-none">
                <AnimatedCounter value={card.value} format="currency" currency={currency} />
              </div>
              <div className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity">
                View <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.section>

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Revenue chart — 2/3 */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="lg:col-span-2">
          <Panel title="Revenue" subtitle="Last 12 months" href="/invoices" hrefLabel="All invoices">
            <div className="px-1">
              <RevenueChart data={stats.monthlyData} currency={currency} />
            </div>
          </Panel>
        </motion.div>

        {/* Today's pulse — 1/3 */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
          <motion.div variants={fadeUp}>
            <Panel title="Today" subtitle="Operations pulse">
              <div className="divide-y divide-border/60">
                <PulseRow
                  label="Scheduled"
                  value={scheduledToday.length}
                  hint={scheduledToday.length === 1 ? "job" : "jobs"}
                  dot="bg-amber-500"
                  href="/work-orders"
                />
                <PulseRow
                  label="On site now"
                  value={onSite.length}
                  hint={onSite.length === 1 ? "worker" : "workers"}
                  dot="bg-emerald-500"
                  pulse={onSite.length > 0}
                  href="/work-orders"
                />
                <PulseRow
                  label="Needs review"
                  value={needsReview.length}
                  hint={needsReview.length === 1 ? "submitted" : "submitted"}
                  dot="bg-violet-500"
                  highlight={needsReview.length > 0}
                  href="/work-orders"
                />
              </div>
            </Panel>
          </motion.div>

          <motion.div variants={fadeUp}>
            <Panel title="Quick add">
              <div className="grid grid-cols-2 gap-2">
                <QuickLink href="/customers/new" icon={UserPlus} label="Customer" />
                <QuickLink href="/invoices/new" icon={FileText} label="Invoice" />
                <QuickLink href="/quotes/new" icon={FileCheck} label="Quote" />
                <QuickLink href="/work-orders/new" icon={Wrench} label="Job" />
              </div>
            </Panel>
          </motion.div>
        </motion.div>

        {/* Jobs list — 2/3 */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="lg:col-span-2">
          <Panel
            title="Jobs"
            subtitle={todayJobs.length === 0 ? "No activity" : `${scheduledToday.length} scheduled · ${activeOther.length} carried over`}
            href="/work-orders"
            hrefLabel="View all"
          >
            {todayJobs.length === 0 ? (
              <EmptyState
                icon={Wrench}
                title="Nothing scheduled today"
                hint="Plan tomorrow or knock out a quote"
                action={{ href: "/work-orders/new", label: "Schedule a job" }}
              />
            ) : (
              <div className="divide-y divide-border/60">
                {scheduledToday.map((job) => <JobRow key={job.id} job={job} />)}
                {activeOther.length > 0 && (
                  <>
                    <div className="px-6 py-2 bg-muted/30">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Carried over</p>
                    </div>
                    {activeOther.map((job) => <JobRow key={job.id} job={job} />)}
                  </>
                )}
              </div>
            )}
          </Panel>
        </motion.div>

        {/* Recent invoices — 1/3 */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Panel title="Recent invoices" href="/invoices" hrefLabel="View all">
            {stats.recentInvoices.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No invoices yet"
                action={{ href: "/invoices/new", label: "Create first invoice" }}
              />
            ) : (
              <div className="divide-y divide-border/60">
                {stats.recentInvoices.map((invoice, i) => (
                  <Link key={invoice.id ?? i} href={`/invoices/${invoice.id}`}>
                    <div className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/40 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{invoice.customers?.name ?? "No client"}</p>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{invoice.number}</p>
                      </div>
                      <div className="text-right ml-3 flex-shrink-0">
                        <p className="font-display text-base font-medium tabular-nums">{formatCurrency(invoice.total ?? 0, currency)}</p>
                        <Badge variant="secondary" className={`text-[10px] mt-0.5 ${getStatusColor(invoice.status ?? "draft")}`}>
                          {invoice.status}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </motion.div>

      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Panel({
  title, subtitle, href, hrefLabel, children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-6 pt-5 pb-4">
        <div>
          <h2 className="font-display text-lg font-medium tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {href && hrefLabel && (
          <Link href={href} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {hrefLabel} <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="flex-1 pb-2">{children}</div>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border/70 bg-background hover:bg-muted/60 text-sm font-medium transition-colors">
      <Icon className="w-3.5 h-3.5" /> {label}
    </Link>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/60 hover:border-border hover:bg-muted/40 text-sm transition-colors">
      <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
      <span className="text-foreground/80 group-hover:text-foreground transition-colors">{label}</span>
    </Link>
  );
}

function PulseRow({
  label, value, hint, dot, pulse, highlight, href,
}: {
  label: string;
  value: number;
  hint: string;
  dot: string;
  pulse?: boolean;
  highlight?: boolean;
  href: string;
}) {
  return (
    <Link href={href} className={`flex items-center justify-between px-6 py-3.5 hover:bg-muted/40 transition-colors ${highlight ? "bg-violet-50/40 dark:bg-violet-950/10" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full ${dot} ${pulse ? "animate-pulse ring-2 ring-emerald-200 dark:ring-emerald-900/50" : ""}`} />
        <span className="text-sm text-foreground/80">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-xl font-medium tabular-nums leading-none">{value}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
    </Link>
  );
}

function EmptyState({
  icon: Icon, title, hint, action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-11 h-11 rounded-full bg-muted/50 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-muted-foreground/60" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1 mb-4">{hint}</p>}
      {action && (
        <Link href={action.href} className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border/70 bg-background hover:bg-muted/60 text-xs font-medium transition-colors">
          <Plus className="w-3 h-3" /> {action.label}
        </Link>
      )}
    </div>
  );
}

function JobRow({ job }: { job: WorkOrderWithCustomer }) {
  const isToday = job.scheduled_date === new Date().toISOString().split("T")[0];
  return (
    <Link href={`/work-orders/${job.id}`}>
      <div className="flex items-center gap-3 px-6 py-3.5 hover:bg-muted/40 transition-colors group">
        <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0">
          <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono text-muted-foreground">{job.number}</span>
            <p className="text-sm font-medium truncate">{job.title}</p>
            <Badge className={`${JOB_STATUS_STYLES[job.status]} text-[10px] border-0`}>
              {job.status.replace("_", " ")}
            </Badge>
            {!isToday && job.scheduled_date && (
              <span className="text-[11px] text-muted-foreground">· {job.scheduled_date}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            {job.property_address && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 flex-shrink-0" />{job.property_address}
              </span>
            )}
            {job.assigned_to_email && (
              <span className="flex items-center gap-1 flex-shrink-0">
                <User className="w-3 h-3" />{job.assigned_to_email}
              </span>
            )}
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all flex-shrink-0" />
      </div>
    </Link>
  );
}
