"use client";

import { motion, type Variants } from "framer-motion";
import {
  TrendingUp, Clock, AlertTriangle, CheckCircle, Plus, FileText,
  Wrench, MapPin, User, ArrowRight, FileCheck, UserPlus,
  MoreHorizontal,
} from "@/components/ui/icons";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, getStatusColor } from "@/lib/utils";
import { AnimatedCounter } from "./animated-counter";
import type { WorkOrderWithCustomer, WorkOrderStatus } from "@/types/database";

const JOB_STATUS_STYLES: Record<WorkOrderStatus, string> = {
  draft:       "bg-neutral-100 text-neutral-700",
  assigned:    "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-800",
  submitted:   "bg-violet-100 text-violet-700",
  reviewed:    "bg-yellow-100 text-yellow-800",
  completed:   "bg-lime-200 text-lime-900",
  cancelled:   "bg-rose-100 text-rose-700",
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
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
  const dateLabel = now.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const scheduledToday = todayJobs.filter((j) => j.scheduled_date === todayStr);
  const onSite         = todayJobs.filter((j) => j.status === "in_progress");
  const needsReview    = todayJobs.filter((j) => j.status === "submitted");

  const total = Math.max(stats.totalRevenue + stats.outstanding + stats.overdue, 1);
  const paidPct = Math.round((stats.totalRevenue / total) * 100);
  const outPct  = Math.round((stats.outstanding / total) * 100);
  const overPct = Math.max(0, 100 - paidPct - outPct);

  const monthly = stats.monthlyData.slice(-7);
  const maxBar = Math.max(...monthly.map((m) => Math.max(m.revenue, m.invoiced)), 1);
  const peakIdx = monthly.reduce((acc, m, i) => (m.revenue > monthly[acc].revenue ? i : acc), 0);

  return (
    <div className="min-h-full">
      <div className="max-w-[1500px] mx-auto">

        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="flex items-center justify-between gap-3 mb-6"
        >
          <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="font-medium text-neutral-900 dark:text-neutral-100">Overview</span>
            <span className="text-neutral-400">·</span>
            <span>{dateLabel}</span>
          </div>
          {needsReview.length > 0 && (
            <Link
              href="/work-orders"
              className="relative inline-flex items-center gap-2 pl-2 pr-4 py-1.5 rounded-full bg-white dark:bg-neutral-900 border border-black/5 dark:border-white/5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <span className="w-7 h-7 rounded-full bg-lime-300 text-lime-950 text-xs font-bold flex items-center justify-center">
                {needsReview.length}
              </span>
              <span className="text-neutral-700 dark:text-neutral-200">need review</span>
            </Link>
          )}
        </motion.div>

        {/* ── Title row ────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
          className="flex items-end justify-between gap-4 mb-7 flex-wrap"
        >
          <div>
            <h1 className="font-display text-5xl sm:text-6xl font-semibold tracking-tight leading-none text-neutral-900 dark:text-neutral-50">
              Dashboard
            </h1>
            <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-2">
              Take control of your business today!
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/quotes/new" className="px-4 py-2.5 rounded-full bg-white dark:bg-neutral-900 border border-black/5 dark:border-white/10 text-sm font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5" /> New quote
            </Link>
            <Link href="/invoices/new" className="px-4 py-2.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New invoice
            </Link>
          </div>
        </motion.div>

        {/* ── Overdue strip ────────────────────────────────────────────── */}
        {stats.overdue > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
            className="mb-5"
          >
            <Link href="/invoices?status=overdue" className="group flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-rose-100 dark:bg-rose-950/40 hover:bg-rose-200/60 dark:hover:bg-rose-950/60 transition-colors">
              <div className="w-9 h-9 rounded-full bg-rose-200 dark:bg-rose-900/50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-lg font-semibold text-rose-900 dark:text-rose-200 leading-tight">
                  {formatCurrency(stats.overdue, currency)} overdue
                </p>
                <p className="text-xs text-rose-700/80 dark:text-rose-300/70">Send reminders to bring these in</p>
              </div>
              <ArrowRight className="w-4 h-4 text-rose-700 dark:text-rose-300 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </motion.div>
        )}

        {/* ── Main grid: Revenue Mix (left 2/3) + side stack (right 1/3) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── LEFT: big Revenue Mix card ──────────────────────────── */}
          <motion.div
            variants={fadeUp} initial="hidden" animate="show"
            className="lg:col-span-2 rounded-[28px] bg-white dark:bg-neutral-900 p-7 sm:p-8 border border-black/5 dark:border-white/5"
          >
            <CardHeader
              icon={<TrendingUp className="w-4 h-4" />}
              label="Revenue mix"
              chip={<DeltaChip value="+5%" positive />}
            />

            <div className="flex items-baseline gap-3 mt-3">
              <div className="font-display text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums text-neutral-900 dark:text-neutral-50">
                <AnimatedCounter value={stats.totalRevenue} format="currency" currency={currency} />
              </div>
              <span className="text-sm text-neutral-500">paid lifetime</span>
            </div>

            {/* Bubble chart */}
            <div className="mt-6 mb-7 flex justify-center">
              <BubbleChart
                paid={stats.totalRevenue}
                outstanding={stats.outstanding}
                overdue={stats.overdue}
                currency={currency}
              />
            </div>

            {/* Progress bars */}
            <div className="space-y-4">
              <ProgressRow label="Paid"        pct={paidPct} value={stats.totalRevenue} currency={currency} barClass="bg-violet-300" />
              <ProgressRow label="Outstanding" pct={outPct}  value={stats.outstanding}  currency={currency} barClass="bg-neutral-900 dark:bg-neutral-100" />
              <ProgressRow label="Overdue"     pct={overPct} value={stats.overdue}      currency={currency} barClass="bg-lime-300" />
            </div>
          </motion.div>

          {/* ── RIGHT column ──────────────────────────────────────── */}
          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">

            {/* 2x1 small KPIs */}
            <div className="grid grid-cols-2 gap-5">
              <motion.div variants={fadeUp}>
                <SmallKpi
                  icon={<Clock className="w-3.5 h-3.5" />}
                  label="Outstanding"
                  value={stats.outstanding}
                  currency={currency}
                  hintTop="Avg"
                  hintBottom={`${stats.recentInvoices.length} invoices`}
                  href="/invoices"
                />
              </motion.div>
              <motion.div variants={fadeUp}>
                <SmallKpi
                  icon={<CheckCircle className="w-3.5 h-3.5" />}
                  label="This month"
                  value={stats.paidThisMonth}
                  currency={currency}
                  hintTop="Paid"
                  hintBottom="this period"
                  href="/invoices?status=paid"
                />
              </motion.div>
            </div>

            {/* Activity */}
            <motion.div variants={fadeUp}>
              <Link
                href="/work-orders"
                className="block rounded-[24px] bg-white dark:bg-neutral-900 p-6 border border-black/5 dark:border-white/5 hover:shadow-sm transition-shadow"
              >
                <CardHeader
                  icon={<Wrench className="w-4 h-4" />}
                  label="Activity"
                />
                <div className="flex items-end justify-between mt-2">
                  <div className="font-display text-3xl font-semibold tracking-tight tabular-nums text-neutral-900 dark:text-neutral-50">
                    {scheduledToday.length}
                    <span className="text-sm font-normal text-neutral-500 ml-1">jobs</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-neutral-500">On site</p>
                    <p className="text-sm font-medium">{onSite.length} active</p>
                  </div>
                </div>
              </Link>
            </motion.div>

          </motion.div>

          {/* ── DARK Cash Flow card (full bottom) ─────────────────── */}
          <motion.div
            variants={fadeUp} initial="hidden" animate="show"
            className="lg:col-span-3 rounded-[28px] bg-neutral-950 dark:bg-neutral-900 text-neutral-100 p-7 sm:p-8 border border-black/10"
          >
            <div className="flex items-center justify-between mb-5">
              <CardHeader
                icon={<Clock className="w-4 h-4" />}
                label="Cash flow"
                dark
              />
              <button className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 transition-colors text-xs font-medium flex items-center gap-1.5">
                Monthly <span className="opacity-60">▾</span>
              </button>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 mb-7">
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-7 rounded-full bg-lime-300" />
                <div>
                  <div className="font-display text-2xl sm:text-3xl font-semibold tabular-nums leading-none">
                    {formatCurrency(stats.paidThisMonth, currency)}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">Paid this month</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-7 rounded-full bg-violet-300" />
                <div>
                  <div className="font-display text-2xl sm:text-3xl font-semibold tabular-nums leading-none">
                    {formatCurrency(stats.outstanding, currency)}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">Outstanding</p>
                </div>
              </div>
            </div>

            {/* Mini bar chart */}
            <div className="grid grid-cols-7 gap-2 sm:gap-3 h-40 items-end">
              {monthly.map((m, i) => {
                const isPeak = i === peakIdx;
                const revH = (m.revenue / maxBar) * 100;
                const invH = (m.invoiced / maxBar) * 100;
                return (
                  <div key={m.month} className="flex flex-col items-center gap-2">
                    <div className="flex items-end gap-1 h-32 w-full justify-center">
                      <div
                        className={`w-3 sm:w-4 rounded-full ${isPeak ? "bg-lime-300" : "bg-white/10"}`}
                        style={{ height: `${Math.max(revH, 6)}%` }}
                      />
                      <div
                        className={`w-3 sm:w-4 rounded-full ${isPeak ? "bg-violet-300" : "bg-white/10"}`}
                        style={{ height: `${Math.max(invH, 6)}%` }}
                      />
                    </div>
                    <span className={`text-[11px] ${isPeak ? "text-white font-medium" : "text-neutral-500"}`}>
                      {m.month}{isPeak ? " ↗" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* ── Jobs (left) and Recent Invoices (right) ──────────── */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="lg:col-span-2 rounded-[28px] bg-white dark:bg-neutral-900 border border-black/5 dark:border-white/5 overflow-hidden">
            <div className="flex items-center justify-between px-7 pt-6 pb-4">
              <CardHeader icon={<Wrench className="w-4 h-4" />} label="Today's jobs" />
              <Link href="/work-orders" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {todayJobs.length === 0 ? (
              <EmptyState icon={Wrench} title="Nothing scheduled today" hint="A clean slate to plan ahead" action={{ href: "/work-orders/new", label: "Schedule a job" }} />
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-white/5">
                {todayJobs.slice(0, 5).map((job) => <JobRow key={job.id} job={job} />)}
              </div>
            )}
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-[28px] bg-white dark:bg-neutral-900 border border-black/5 dark:border-white/5 overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <CardHeader icon={<FileText className="w-4 h-4" />} label="Recent" />
              <Link href="/invoices" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {stats.recentInvoices.length === 0 ? (
              <EmptyState icon={FileText} title="No invoices yet" action={{ href: "/invoices/new", label: "Create first" }} />
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-white/5">
                {stats.recentInvoices.slice(0, 5).map((invoice, i) => (
                  <Link key={invoice.id ?? i} href={`/invoices/${invoice.id}`}>
                    <div className="flex items-center justify-between px-6 py-3.5 hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{invoice.customers?.name ?? "No client"}</p>
                        <p className="text-[11px] text-neutral-500 font-mono mt-0.5">{invoice.number}</p>
                      </div>
                      <div className="text-right ml-3 flex-shrink-0">
                        <p className="font-display text-base font-semibold tabular-nums">{formatCurrency(invoice.total ?? 0, currency)}</p>
                        <Badge variant="secondary" className={`text-[10px] mt-0.5 border-0 ${getStatusColor(invoice.status ?? "draft")}`}>
                          {invoice.status}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </motion.div>

          {/* ── Quick actions row ────────────────────────────────── */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="lg:col-span-3 rounded-[28px] bg-white dark:bg-neutral-900 p-6 border border-black/5 dark:border-white/5">
            <div className="flex items-center justify-between mb-4">
              <CardHeader icon={<Plus className="w-4 h-4" />} label="Quick add" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <QuickLink href="/customers/new" icon={UserPlus} label="Customer" />
              <QuickLink href="/invoices/new" icon={FileText} label="Invoice" />
              <QuickLink href="/quotes/new" icon={FileCheck} label="Quote" />
              <QuickLink href="/work-orders/new" icon={Wrench} label="Job" />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CardHeader({
  icon, label, chip, dark,
}: {
  icon: React.ReactNode;
  label: string;
  chip?: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${dark ? "bg-white/10 text-white/80" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"}`}>
        {icon}
      </div>
      <span className={`text-sm font-medium ${dark ? "text-white" : "text-neutral-900 dark:text-neutral-100"}`}>
        {label}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {chip}
        <button className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${dark ? "text-white/40 hover:text-white/80 hover:bg-white/5" : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function DeltaChip({ value, positive }: { value: string; positive?: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${positive ? "bg-lime-300 text-lime-950" : "bg-rose-200 text-rose-900"}`}>
      {value}
    </span>
  );
}

function SmallKpi({
  icon, label, value, currency, hintTop, hintBottom, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  currency: string;
  hintTop: string;
  hintBottom: string;
  href: string;
}) {
  return (
    <Link href={href} className="block rounded-[24px] bg-white dark:bg-neutral-900 p-5 border border-black/5 dark:border-white/5 hover:shadow-sm transition-shadow h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
          {icon}
        </div>
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="font-display text-2xl font-semibold tracking-tight tabular-nums leading-none text-neutral-900 dark:text-neutral-50 truncate">
          <AnimatedCounter value={value} format="currency" currency={currency} />
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">{hintTop}</p>
          <p className="text-[11px] text-neutral-700 dark:text-neutral-300">{hintBottom}</p>
        </div>
      </div>
    </Link>
  );
}

function ProgressRow({
  label, pct, value, currency, barClass,
}: {
  label: string;
  pct: number;
  value: number;
  currency: string;
  barClass: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">{pct}<span className="text-xs text-neutral-500 ml-0.5">%</span></span>
          <span className="text-xs text-neutral-500">{label}</span>
        </div>
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 tabular-nums">{formatCurrency(value, currency)}</span>
      </div>
      <div className="h-2.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div className={`h-full rounded-full ${barClass} transition-all duration-700`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

function BubbleChart({
  paid, outstanding, overdue, currency,
}: {
  paid: number;
  outstanding: number;
  overdue: number;
  currency: string;
}) {
  // Sizes proportional to sqrt(value), normalized
  const max = Math.max(paid, outstanding, overdue, 1);
  const r = (v: number, base = 60) => Math.max(28, Math.sqrt(v / max) * base);
  const rPaid = r(paid, 80);
  const rOut  = r(outstanding, 70);
  const rOver = r(overdue, 60);
  const fmt = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return formatCurrency(v, currency).replace(/\.\d+/, "");
  };

  return (
    <div className="relative w-full max-w-[420px] h-[260px]">
      {/* Paid — large, lavender, left */}
      <div
        className="absolute rounded-full bg-violet-300 flex flex-col items-center justify-center text-violet-950 font-semibold"
        style={{
          width: rPaid * 2, height: rPaid * 2,
          left: "8%", top: "20%",
        }}
      >
        <span className="font-display text-2xl tabular-nums">{fmt(paid)}</span>
        <span className="text-[11px] font-normal opacity-80">paid</span>
      </div>
      {/* Outstanding — medium, dark, top right */}
      <div
        className="absolute rounded-full bg-neutral-900 dark:bg-neutral-100 flex flex-col items-center justify-center text-white dark:text-neutral-900 font-semibold"
        style={{
          width: rOut * 2, height: rOut * 2,
          right: "8%", top: "8%",
        }}
      >
        <span className="font-display text-xl tabular-nums">{fmt(outstanding)}</span>
        <span className="text-[10px] font-normal opacity-70">outstanding</span>
      </div>
      {/* Overdue — small, lime, bottom center */}
      <div
        className="absolute rounded-full bg-lime-300 flex flex-col items-center justify-center text-lime-950 font-semibold"
        style={{
          width: rOver * 2, height: rOver * 2,
          left: "44%", bottom: "4%",
        }}
      >
        <span className="font-display text-lg tabular-nums">{fmt(overdue)}</span>
        <span className="text-[10px] font-normal opacity-80">overdue</span>
      </div>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
      <div className="w-8 h-8 rounded-full bg-white dark:bg-neutral-900 flex items-center justify-center group-hover:bg-lime-300 group-hover:text-lime-950 transition-colors">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
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
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-neutral-500" />
      </div>
      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{title}</p>
      {hint && <p className="text-xs text-neutral-500 mt-1">{hint}</p>}
      {action && (
        <Link href={action.href} className="mt-4 px-4 py-2 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Plus className="w-3 h-3" /> {action.label}
        </Link>
      )}
    </div>
  );
}

function JobRow({ job }: { job: WorkOrderWithCustomer }) {
  return (
    <Link href={`/work-orders/${job.id}`}>
      <div className="flex items-center gap-3 px-7 py-4 hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors group">
        <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center flex-shrink-0">
          <Wrench className="w-4 h-4 text-violet-700 dark:text-violet-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{job.title}</p>
            <Badge className={`${JOB_STATUS_STYLES[job.status]} text-[10px] border-0 rounded-full`}>
              {job.status.replace("_", " ")}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-neutral-500">
            <span className="font-mono">{job.number}</span>
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
        <ArrowRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-700 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
      </div>
    </Link>
  );
}
