"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Wrench, MapPin, Clock, CheckCircle, ArrowRight, Calendar, AlertTriangle,
} from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import type { WorkOrderWithCustomer, WorkOrderStatus } from "@/types/database";

const STATUS_PILL: Record<WorkOrderStatus, string> = {
  draft:       "bg-neutral-100 text-neutral-700",
  assigned:    "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-800",
  submitted:   "bg-violet-100 text-violet-700",
  reviewed:    "bg-yellow-100 text-yellow-800",
  completed:   "bg-lime-200 text-lime-900",
  cancelled:   "bg-rose-100 text-rose-700",
};

interface WorkerDashboardProps {
  userEmail: string;
  businessName: string;
  todayJobs: WorkOrderWithCustomer[];
  allJobs: WorkOrderWithCustomer[];
}

export function WorkerDashboard({ userEmail, businessName, todayJobs, allJobs }: WorkerDashboardProps) {
  const todayStr = new Date().toISOString().split("T")[0];
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  const onSite      = allJobs.filter((j) => j.status === "in_progress");
  const upcoming    = allJobs.filter((j) => j.scheduled_date && j.scheduled_date > todayStr && ["assigned", "draft"].includes(j.status));
  const needsAction = todayJobs.filter((j) => j.status === "assigned" || j.status === "in_progress");
  const completedThisWeek = allJobs.filter((j) => {
    if (!j.completed_at) return false;
    const d = new Date(j.completed_at);
    const week = new Date(); week.setDate(week.getDate() - 7);
    return d > week;
  });

  return (
    <div>
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/5 text-[11px] font-medium text-foreground/70">
            <Calendar className="w-3 h-3" /> {todayLabel}
          </span>
        </div>
        <h1 className="font-display text-4xl sm:text-5xl font-medium tracking-tight leading-[1.05]">
          {greeting}.
        </h1>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl">
          {needsAction.length === 0
            ? "Nothing on your plate today — enjoy the breathing room."
            : `You have ${needsAction.length} ${needsAction.length === 1 ? "job" : "jobs"} to take care of today${onSite.length ? ` (${onSite.length} on site)` : ""}.`}
        </p>
        <p className="mt-3 text-xs text-muted-foreground/70">
          Working with <span className="font-medium text-foreground/80">{businessName}</span> as <span className="font-mono">{userEmail}</span>
        </p>
      </motion.section>

      {/* KPI strip */}
      <motion.section
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border/60 rounded-2xl overflow-hidden border border-border/60 mb-8"
      >
        <Stat icon={<Wrench className="w-3.5 h-3.5" />} label="Today" value={needsAction.length} hint={needsAction.length === 1 ? "job" : "jobs"} accent="text-amber-600" />
        <Stat icon={<Clock className="w-3.5 h-3.5" />} label="On site now" value={onSite.length} hint={onSite.length === 1 ? "active" : "active"} accent="text-emerald-600" />
        <Stat icon={<Calendar className="w-3.5 h-3.5" />} label="Upcoming" value={upcoming.length} hint={upcoming.length === 1 ? "scheduled" : "scheduled"} accent="text-blue-600" />
        <Stat icon={<CheckCircle className="w-3.5 h-3.5" />} label="Done this week" value={completedThisWeek.length} hint={completedThisWeek.length === 1 ? "complete" : "complete"} accent="text-violet-600" />
      </motion.section>

      {/* Jobs */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
        className="rounded-[28px] bg-card border border-black/5 overflow-hidden"
      >
        <div className="flex items-center justify-between px-7 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium">Today&apos;s jobs</span>
            {todayJobs.length > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-lime-300 text-lime-950 text-[10px] font-bold">
                {todayJobs.length}
              </span>
            )}
          </div>
          <Link href="/work-orders" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            All jobs <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {todayJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Wrench className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No jobs assigned to you today</p>
            <p className="text-xs text-muted-foreground mt-1">Upcoming jobs will appear here when scheduled</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {todayJobs.map((job) => <JobRow key={job.id} job={job} />)}
          </div>
        )}
      </motion.section>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}
          className="rounded-[28px] bg-card border border-black/5 overflow-hidden mt-5"
        >
          <div className="flex items-center justify-between px-7 pt-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">Upcoming</span>
            </div>
            <Link href="/schedule" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              Schedule <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border/60">
            {upcoming.slice(0, 6).map((job) => <JobRow key={job.id} job={job} showDate />)}
          </div>
        </motion.section>
      )}

      {needsAction.some((j) => j.status === "in_progress") && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-5 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-amber-100 dark:bg-amber-950/40"
        >
          <div className="w-9 h-9 rounded-full bg-amber-200 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-800 dark:text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 leading-tight">
              You have jobs in progress
            </p>
            <p className="text-xs text-amber-800/70 dark:text-amber-300/70">Don&apos;t forget to submit them with photos when you&apos;re done</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Stat({
  icon, label, value, hint, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  accent: string;
}) {
  return (
    <div className="bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={accent}>{icon}</span>
      </div>
      <div className="font-display text-3xl font-medium tracking-tight tabular-nums leading-none">
        {value}
        <span className="text-sm font-normal text-muted-foreground ml-1">{hint}</span>
      </div>
    </div>
  );
}

function JobRow({ job, showDate }: { job: WorkOrderWithCustomer; showDate?: boolean }) {
  return (
    <Link href={`/work-orders/${job.id}`}>
      <div className="flex items-center gap-3 px-7 py-4 hover:bg-muted/40 transition-colors group">
        <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
          <Wrench className="w-4 h-4 text-violet-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{job.title}</p>
            <Badge className={`${STATUS_PILL[job.status]} text-[10px] border-0 rounded-full`}>
              {job.status.replace("_", " ")}
            </Badge>
            {showDate && job.scheduled_date && (
              <span className="text-[11px] text-muted-foreground">· {job.scheduled_date}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            <span className="font-mono">{job.number}</span>
            {job.property_address && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 flex-shrink-0" />{job.property_address}
              </span>
            )}
            {!showDate && job.start_time && (
              <span className="flex items-center gap-1 flex-shrink-0">
                <Clock className="w-3 h-3" />{job.start_time}
              </span>
            )}
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-foreground group-hover:translate-x-0.5 transition-all flex-shrink-0" />
      </div>
    </Link>
  );
}
