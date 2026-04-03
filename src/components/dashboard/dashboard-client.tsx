"use client";

import { motion, type Variants } from "framer-motion";
import {
  TrendingUp, Clock, AlertTriangle, CheckCircle, Plus, FileText,
  Wrench, MapPin, User, ChevronRight, FileCheck, UserPlus,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, getStatusColor } from "@/lib/utils";
import { RevenueChart } from "./revenue-chart";
import { AnimatedCounter } from "./animated-counter";
import type { WorkOrderWithCustomer, WorkOrderStatus } from "@/types/database";

// ── Constants ────────────────────────────────────────────────────────────────

const JOB_STATUS_STYLES: Record<WorkOrderStatus, string> = {
  draft:       "bg-slate-100 text-slate-600",
  assigned:    "bg-blue-100 text-blue-700",
  in_progress: "bg-orange-100 text-orange-700",
  submitted:   "bg-purple-100 text-purple-700",
  reviewed:    "bg-yellow-100 text-yellow-700",
  completed:   "bg-green-100 text-green-700",
  cancelled:   "bg-red-100 text-red-700",
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
};

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────

export function DashboardClient({ stats, currency = "GBP", todayJobs }: DashboardClientProps) {
  const todayStr  = new Date().toISOString().split("T")[0];
  const todayLabel = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  const scheduledToday = todayJobs.filter((j) => j.scheduled_date === todayStr);
  const activeOther    = todayJobs.filter((j) => ["in_progress", "submitted"].includes(j.status) && j.scheduled_date !== todayStr);
  const onSite         = todayJobs.filter((j) => j.status === "in_progress");
  const needsReview    = todayJobs.filter((j) => j.status === "submitted");

  return (
    <div className="space-y-8 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/work-orders/new">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Wrench className="w-3.5 h-3.5" /> New Job
            </Button>
          </Link>
          <Link href="/quotes/new">
            <Button size="sm" variant="outline" className="gap-1.5">
              <FileCheck className="w-3.5 h-3.5" /> New Quote
            </Button>
          </Link>
          <Link href="/invoices/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Invoice
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* ── Overdue alert ──────────────────────────────────────────────── */}
      {stats.overdue > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="flex items-center gap-3 p-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/10">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                {formatCurrency(stats.overdue, currency)} overdue
              </p>
              <p className="text-xs text-red-600/70 dark:text-red-400/70">Invoices past their due date — send reminders to get paid</p>
            </div>
            <Link href="/invoices?status=overdue">
              <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 flex-shrink-0">
                View overdue
              </Button>
            </Link>
          </div>
        </motion.div>
      )}

      {/* ── Operations ────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Today&apos;s Operations</SectionLabel>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">

          {/* Jobs list — left 2/3 */}
          <motion.div
            variants={fadeUp} initial="hidden" animate="show"
            className="lg:col-span-2"
          >
            <Card className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Jobs</CardTitle>
                    {todayJobs.length > 0 && (
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-xs">
                        {scheduledToday.length} scheduled
                      </Badge>
                    )}
                  </div>
                  <Link href="/work-orders">
                    <Button variant="ghost" size="sm" className="text-xs h-7">View all</Button>
                  </Link>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {todayJobs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                      <Wrench className="w-6 h-6 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium">Nothing scheduled for today</p>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">Schedule a work order and assign it to a worker</p>
                    <Link href="/work-orders/new">
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <Plus className="w-3.5 h-3.5" /> Schedule a job
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y">
                    {scheduledToday.map((job) => <JobRow key={job.id} job={job} />)}

                    {activeOther.length > 0 && (
                      <>
                        <div className="px-5 py-2 bg-muted/40">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Carried over</p>
                        </div>
                        {activeOther.map((job) => <JobRow key={job.id} job={job} />)}
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Status summary — right 1/3 */}
          <motion.div
            variants={stagger} initial="hidden" animate="show"
            className="flex flex-col gap-4"
          >
            <motion.div variants={fadeUp}>
              <StatPill
                icon={<Wrench className="w-4 h-4 text-orange-500" />}
                bg="bg-orange-50"
                label="Scheduled today"
                value={scheduledToday.length}
                suffix="jobs"
                href="/work-orders"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatPill
                icon={<div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />}
                bg="bg-emerald-50"
                label="On site now"
                value={onSite.length}
                suffix={onSite.length === 1 ? "worker" : "workers"}
                href="/work-orders"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatPill
                icon={<div className="w-2.5 h-2.5 rounded-full bg-purple-500" />}
                bg="bg-purple-50"
                label="Need review"
                value={needsReview.length}
                suffix="submitted"
                href="/work-orders"
                highlight={needsReview.length > 0}
              />
            </motion.div>

            {/* Quick shortcuts */}
            <motion.div variants={fadeUp}>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Quick add</p>
                  <div className="flex flex-col gap-2">
                    <Link href="/customers/new" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted">
                      <UserPlus className="w-3.5 h-3.5" /> Add customer
                    </Link>
                    <Link href="/invoices/new" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted">
                      <FileText className="w-3.5 h-3.5" /> Create invoice
                    </Link>
                    <Link href="/quotes/new" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted">
                      <FileCheck className="w-3.5 h-3.5" /> Create quote
                    </Link>
                    <Link href="/work-orders/new" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted">
                      <Wrench className="w-3.5 h-3.5" /> Schedule job
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Financials ─────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Financials</SectionLabel>

        {/* KPI row */}
        <motion.div
          variants={stagger} initial="hidden" animate="show"
          className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4"
        >
          {[
            { label: "Total Revenue",   value: stats.totalRevenue,   icon: TrendingUp,  color: "text-emerald-600", bg: "bg-emerald-50", href: "/invoices?status=paid" },
            { label: "Outstanding",     value: stats.outstanding,    icon: Clock,       color: "text-blue-600",   bg: "bg-blue-50",   href: "/invoices" },
            { label: "Overdue",         value: stats.overdue,        icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50",    href: "/invoices?status=overdue" },
            { label: "Paid This Month", value: stats.paidThisMonth,  icon: CheckCircle, color: "text-indigo-600", bg: "bg-indigo-50", href: "/invoices?status=paid" },
          ].map((card) => (
            <motion.div key={card.label} variants={fadeUp}>
              <Link href={card.href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground mb-1.5">{card.label}</p>
                        <div className="text-2xl font-bold tracking-tight">
                          <AnimatedCounter value={card.value} format="currency" currency={currency} />
                        </div>
                      </div>
                      <div className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center flex-shrink-0`}>
                        <card.icon className={`w-4.5 h-4.5 ${card.color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* Chart + Recent Invoices */}
        <motion.div
          variants={stagger} initial="hidden" animate="show"
          className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6"
        >
          <motion.div variants={fadeUp} className="xl:col-span-2">
            <RevenueChart data={stats.monthlyData} currency={currency} />
          </motion.div>

          <motion.div variants={fadeUp}>
            <Card className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Recent Invoices</CardTitle>
                  <Link href="/invoices">
                    <Button variant="ghost" size="sm" className="text-xs h-7">View all</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {stats.recentInvoices.length === 0 ? (
                  <div className="text-center py-10 px-6">
                    <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">No invoices yet</p>
                    <Link href="/invoices/new">
                      <Button variant="outline" size="sm">Create first invoice</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y">
                    {stats.recentInvoices.map((invoice, i) => (
                      <Link key={invoice.id ?? i} href={`/invoices/${invoice.id}`}>
                        <div className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{invoice.customers?.name ?? "No client"}</p>
                            <p className="text-xs text-muted-foreground">{invoice.number}</p>
                          </div>
                          <div className="text-right ml-3 flex-shrink-0">
                            <p className="text-sm font-semibold">{formatCurrency(invoice.total ?? 0, currency)}</p>
                            <Badge variant="secondary" className={`text-xs mt-0.5 ${getStatusColor(invoice.status ?? "draft")}`}>
                              {invoice.status}
                            </Badge>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </section>

    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{children}</p>
      <Separator className="flex-1" />
    </div>
  );
}

function StatPill({
  icon, bg, label, value, suffix, href, highlight,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: number;
  suffix: string;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link href={href}>
      <Card className={`hover:shadow-md transition-shadow cursor-pointer ${highlight ? "border-purple-200 bg-purple-50/40" : ""}`}>
        <CardContent className="p-4 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold leading-tight">
              {value} <span className="text-sm font-normal text-muted-foreground">{suffix}</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function JobRow({ job }: { job: WorkOrderWithCustomer }) {
  const isToday = job.scheduled_date === new Date().toISOString().split("T")[0];
  return (
    <Link href={`/work-orders/${job.id}`}>
      <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors group">
        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
          <Wrench className="w-4 h-4 text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">{job.number}</span>
            <p className="text-sm font-medium truncate">{job.title}</p>
            <Badge className={`${JOB_STATUS_STYLES[job.status]} text-xs`}>
              {job.status.replace("_", " ")}
            </Badge>
            {!isToday && job.scheduled_date && (
              <span className="text-xs text-muted-foreground">· {job.scheduled_date}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
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
        <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
      </div>
    </Link>
  );
}
