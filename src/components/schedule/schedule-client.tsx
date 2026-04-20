"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, LayoutGrid, Columns3 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getScheduledJobs } from "@/lib/actions/schedule";
import { JobModal } from "./job-modal";
import { DispatchBoard } from "./dispatch-board";
import type { ScheduledJob, MemberProfile, Customer } from "@/types/database";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_STYLE: Record<string, { card: string; badge: string; label: string }> = {
  draft:       { card: "border-l-blue-400 bg-blue-50 dark:bg-blue-950/30",    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",    label: "Scheduled" },
  assigned:    { card: "border-l-indigo-400 bg-indigo-50 dark:bg-indigo-950/30", badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300", label: "Assigned" },
  in_progress: { card: "border-l-orange-400 bg-orange-50 dark:bg-orange-950/30", badge: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300", label: "In Progress" },
  submitted:   { card: "border-l-purple-400 bg-purple-50 dark:bg-purple-950/30", badge: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300", label: "Submitted" },
  completed:   { card: "border-l-green-400 bg-green-50 dark:bg-green-950/30",  badge: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",  label: "Completed" },
};

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function formatTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

function formatDateHeader(dateStr: string): { day: string; num: number; today: boolean } {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  return {
    day: DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1],
    num: d.getDate(),
    today:
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear(),
  };
}

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (s.getMonth() === e.getMonth()) {
    return `${months[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${months[s.getMonth()]} ${s.getDate()} – ${months[e.getMonth()]} ${e.getDate()}, ${s.getFullYear()}`;
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500","bg-violet-500","bg-pink-500","bg-orange-500",
  "bg-teal-500","bg-cyan-500","bg-rose-500","bg-amber-500",
];
function avatarColor(id: string): string {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface Props {
  initialJobs: ScheduledJob[];
  initialStart: string;
  initialEnd: string;
  profiles: MemberProfile[];
  customers: Customer[];
}

export function ScheduleClient({ initialJobs, initialStart, initialEnd, profiles, customers }: Props) {
  const [weekStart, setWeekStart] = useState(initialStart);
  const [weekEnd, setWeekEnd]     = useState(initialEnd);
  const [jobs, setJobs]           = useState(initialJobs);
  const [loading, setLoading]     = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // mobile day picker
  const [view, setView] = useState<"week" | "dispatch">("week");
  const [modalState, setModalState] = useState<
    { open: false } |
    { open: true; mode: "create"; defaultDate?: string } |
    { open: true; mode: "edit"; job: ScheduledJob }
  >({ open: false });

  const days = weekDays(weekStart);

  const loadWeek = useCallback(async (start: string) => {
    setLoading(true);
    const end = addDays(start, 6);
    try {
      const data = await getScheduledJobs(start, end);
      setJobs(data);
      setWeekStart(start);
      setWeekEnd(end);
      setSelectedDay(null);
    } catch { toast.error("Failed to load schedule"); }
    setLoading(false);
  }, []);

  const goWeek = (delta: number) => loadWeek(addDays(weekStart, delta * 7));

  const goToday = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    loadWeek(monday.toISOString().split("T")[0]);
  };

  const jobsForDay = (dateStr: string) =>
    jobs.filter((j) => j.scheduled_date === dateStr);

  const displayDays = selectedDay ? [selectedDay] : days;

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{formatWeekRange(weekStart, weekEnd)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border overflow-hidden">
            <Button variant={view === "week" ? "secondary" : "ghost"} size="sm" className="rounded-none h-8 px-2.5" onClick={() => setView("week")} title="Week view">
              <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Week
            </Button>
            <Button variant={view === "dispatch" ? "secondary" : "ghost"} size="sm" className="rounded-none h-8 px-2.5 border-l" onClick={() => setView("dispatch")} title="Dispatch board">
              <Columns3 className="h-3.5 w-3.5 mr-1" /> Dispatch
            </Button>
          </div>
          <div className="flex items-center rounded-lg border overflow-hidden">
            <Button variant="ghost" size="icon" className="rounded-none h-8 w-8" onClick={() => goWeek(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="rounded-none h-8 px-3 text-xs font-medium" onClick={goToday}>
              Today
            </Button>
            <Button variant="ghost" size="icon" className="rounded-none h-8 w-8" onClick={() => goWeek(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button size="sm" onClick={() => setModalState({ open: true, mode: "create" })}>
            <Plus className="h-4 w-4 mr-1.5" /> New Job
          </Button>
        </div>
      </div>

      {view === "dispatch" ? (
        <DispatchBoard
          jobs={jobs}
          weekStart={weekStart}
          profiles={profiles}
          onJobClick={(job) => setModalState({ open: true, mode: "edit", job })}
          onChanged={() => loadWeek(weekStart)}
        />
      ) : (
      <>
      {/* Mobile day tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 sm:hidden">
        {days.map((d) => {
          const { day, num, today } = formatDateHeader(d);
          const count = jobsForDay(d).length;
          const active = selectedDay === d || (!selectedDay && today);
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(selectedDay === d ? null : d)}
              className={`flex flex-col items-center px-3 py-2 rounded-lg min-w-[52px] transition-colors text-sm font-medium ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className="text-xs">{day}</span>
              <span className="text-base font-bold leading-tight">{num}</span>
              {count > 0 && (
                <span className={`text-xs mt-0.5 ${active ? "text-primary-foreground/80" : "text-primary"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Calendar grid */}
      <div className={`grid gap-3 flex-1 ${displayDays.length > 1 ? "grid-cols-7" : "grid-cols-1"} min-h-[400px]`}>
        {displayDays.map((dateStr) => {
          const { day, num, today } = formatDateHeader(dateStr);
          const dayJobs = jobsForDay(dateStr);
          return (
            <div key={dateStr} className="flex flex-col gap-2 min-w-0">
              {/* Day header — desktop only */}
              <div className={`hidden sm:flex items-center justify-between px-2 py-1.5 rounded-lg ${
                today ? "bg-primary text-primary-foreground" : "bg-muted/50"
              }`}>
                <span className="text-xs font-semibold">{day}</span>
                <span className={`text-lg font-bold leading-none ${today ? "" : "text-muted-foreground"}`}>{num}</span>
              </div>

              {/* Jobs */}
              <div className="flex flex-col gap-2 flex-1">
                {loading ? (
                  <div className="h-16 rounded-lg bg-muted/40 animate-pulse" />
                ) : dayJobs.length === 0 ? (
                  <button
                    onClick={() => setModalState({ open: true, mode: "create", defaultDate: dateStr })}
                    className="rounded-lg border-2 border-dashed border-border/50 p-3 text-center text-xs text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors hidden sm:flex items-center justify-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                ) : (
                  dayJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onClick={() => setModalState({ open: true, mode: "edit", job })}
                    />
                  ))
                )}

                {/* Add button for days with jobs */}
                {!loading && dayJobs.length > 0 && (
                  <button
                    onClick={() => setModalState({ open: true, mode: "create", defaultDate: dateStr })}
                    className="rounded-lg border border-dashed border-border/50 p-1.5 text-center text-xs text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors hidden sm:block"
                  >
                    <Plus className="h-3 w-3 inline" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 pt-1">
        {Object.entries(STATUS_STYLE).map(([, v]) => (
          <div key={v.label} className="flex items-center gap-1.5">
            <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${v.badge}`}>{v.label}</span>
          </div>
        ))}
      </div>
      </>
      )}

      {/* Job Modal */}
      {modalState.open && (
        <JobModal
          mode={modalState.mode}
          job={modalState.mode === "edit" ? modalState.job : undefined}
          defaultDate={modalState.mode === "create" ? modalState.defaultDate : undefined}
          profiles={profiles}
          customers={customers}
          onClose={() => setModalState({ open: false })}
          onSaved={async () => {
            setModalState({ open: false });
            await loadWeek(weekStart);
          }}
        />
      )}
    </div>
  );
}

function JobCard({ job, onClick }: { job: ScheduledJob; onClick: () => void }) {
  const style = STATUS_STYLE[job.status] ?? STATUS_STYLE.draft;
  const workers = job.work_order_assignments ?? [];

  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={`w-full text-left rounded-lg border-l-4 p-2.5 shadow-sm hover:shadow-md transition-shadow space-y-1.5 ${style.card}`}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-semibold leading-tight line-clamp-2">{job.title}</p>
        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${style.badge}`}>
          {style.label}
        </span>
      </div>

      {(job.start_time || job.end_time) && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{formatTime(job.start_time)}{job.end_time ? ` – ${formatTime(job.end_time)}` : ""}</span>
        </div>
      )}

      {job.property_address && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{job.property_address}</span>
        </div>
      )}

      {workers.length > 0 && (
        <div className="flex items-center gap-1 pt-0.5">
          <div className="flex -space-x-1.5">
            {workers.slice(0, 4).map((a) => {
              const name = a.member_profiles?.name ?? "?";
              const color = avatarColor(a.member_profile_id);
              return (
                <div
                  key={a.id}
                  title={name}
                  className={`h-5 w-5 rounded-full ${color} flex items-center justify-center text-white text-[9px] font-bold ring-1 ring-background`}
                >
                  {initials(name)}
                </div>
              );
            })}
            {workers.length > 4 && (
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold ring-1 ring-background">
                +{workers.length - 4}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.button>
  );
}
