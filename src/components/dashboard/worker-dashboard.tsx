"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Wrench, MapPin, Clock, CheckCircle, ArrowRight, Calendar, AlertTriangle,
} from "@/components/ui/icons";
import type { WorkOrderWithCustomer, WorkOrderStatus } from "@/types/database";

const STATUS_PILL: Record<WorkOrderStatus, string> = {
  draft:       "draft",
  assigned:    "scheduled",
  in_progress: "in-progress",
  submitted:   "pending",
  reviewed:    "pending",
  completed:   "completed",
  cancelled:   "cancelled",
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
      {/* Page header — matches the rest of the app */}
      <motion.div
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="ch-page-header"
      >
        <div>
          <h1 className="ch-page-title">{greeting}.</h1>
          <p className="ch-page-subtitle">
            {needsAction.length === 0
              ? `Nothing on your plate today — enjoy the breathing room.`
              : `You have ${needsAction.length} ${needsAction.length === 1 ? "job" : "jobs"} to take care of today${onSite.length ? ` · ${onSite.length} on site` : ""}.`}
          </p>
        </div>
        <div className="ch-page-actions">
          <Link href="/work-orders">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors">
              <Wrench className="w-3.5 h-3.5" /> All jobs
            </button>
          </Link>
          <Link href="/schedule">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              <Calendar className="w-3.5 h-3.5" /> Schedule
            </button>
          </Link>
        </div>
      </motion.div>

      {/* In-progress hint strip */}
      {needsAction.some((j) => j.status === "in_progress") && (
        <Link href="/work-orders?status=in_progress" className="block mb-5">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 hover:bg-amber-100/60 dark:hover:bg-amber-950/50 transition-colors">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 leading-tight">
                You have jobs in progress
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/70">Don&apos;t forget to submit them with photos when you&apos;re done</p>
            </div>
            <ArrowRight className="w-4 h-4 text-amber-700 dark:text-amber-300" />
          </div>
        </Link>
      )}

      {/* KPI strip — same style as the owner dashboard */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="ch-stat-grid"
      >
        <Stat icon={<Wrench className="w-3.5 h-3.5" />} label="Today" value={needsAction.length} sub={needsAction.length === 1 ? "job" : "jobs"} />
        <Stat icon={<Clock className="w-3.5 h-3.5" />} label="On site now" value={onSite.length} sub="active" />
        <Stat icon={<Calendar className="w-3.5 h-3.5" />} label="Upcoming" value={upcoming.length} sub="scheduled" />
        <Stat icon={<CheckCircle className="w-3.5 h-3.5" />} label="Done this week" value={completedThisWeek.length} sub="complete" />
      </motion.div>

      {/* Two-column body — Today's jobs + Upcoming */}
      <div className="ch-grid-2">
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                Today&apos;s jobs
                {todayJobs.length > 0 && <span className="ch-pill in-progress">{todayJobs.length}</span>}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Tap a job to start work</p>
            </div>
            <Link href="/work-orders" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              All jobs <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {todayJobs.length === 0 ? (
            <div className="ch-empty">
              <h4>No jobs assigned to you today</h4>
              <p>Upcoming jobs will appear here when scheduled.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {todayJobs.map((job) => <JobRow key={job.id} job={job} />)}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                Upcoming
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Next 7 days</p>
            </div>
            <Link href="/schedule" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              Schedule <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="ch-empty">
              <h4>Nothing scheduled</h4>
              <p>Your upcoming jobs will show here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {upcoming.slice(0, 6).map((job) => <JobRow key={job.id} job={job} showDate />)}
            </div>
          )}
        </div>
      </div>

      {/* Footer attribution */}
      <p className="mt-6 text-[11px] text-muted-foreground/70">
        Working with <span className="font-medium text-foreground/80">{businessName}</span> as <span className="font-mono">{userEmail}</span>
      </p>
    </div>
  );
}

function Stat({
  icon, label, value, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="ch-stat">
      <div className="ch-stat-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="ch-stat-value">{value}</div>
      <div className="ch-stat-meta">
        <span>{sub}</span>
      </div>
    </div>
  );
}

function JobRow({ job, showDate }: { job: WorkOrderWithCustomer; showDate?: boolean }) {
  return (
    <Link href={`/work-orders/${job.id}`}>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Wrench className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{job.title}</p>
            <span className={`ch-pill ${STATUS_PILL[job.status]}`}>{job.status.replace("_", " ")}</span>
            {showDate && job.scheduled_date && (
              <span className="text-[11px] text-muted-foreground">· {job.scheduled_date}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            <span className="ch-mono">{job.number}</span>
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
        <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all flex-shrink-0" />
      </div>
    </Link>
  );
}
