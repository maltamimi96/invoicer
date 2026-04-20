"use client";

import { useState } from "react";
import { Clock, MapPin, UserCircle2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { rescheduleJob } from "@/lib/actions/schedule";
import type { ScheduledJob, MemberProfile } from "@/types/database";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_DOT: Record<string, string> = {
  draft:       "bg-blue-400",
  assigned:    "bg-indigo-400",
  in_progress: "bg-orange-400",
  submitted:   "bg-purple-400",
  completed:   "bg-green-400",
};

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}
function weekDays(start: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
function formatTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}
function isToday(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}
function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
const AVATAR_COLORS = ["bg-blue-500","bg-violet-500","bg-pink-500","bg-orange-500","bg-teal-500","bg-cyan-500","bg-rose-500","bg-amber-500"];
function avatarColor(id: string): string {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface Props {
  jobs: ScheduledJob[];
  weekStart: string;
  profiles: MemberProfile[];
  onJobClick: (job: ScheduledJob) => void;
  onChanged: () => void | Promise<void>;
}

export function DispatchBoard({ jobs, weekStart, profiles, onJobClick, onChanged }: Props) {
  const days = weekDays(weekStart);
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // `${profileId}|${date}`

  // Group jobs: profile id ("" = unassigned) -> date -> jobs
  const grid = new Map<string, Map<string, ScheduledJob[]>>();
  const ensure = (pid: string, d: string) => {
    if (!grid.has(pid)) grid.set(pid, new Map());
    const dayMap = grid.get(pid)!;
    if (!dayMap.has(d)) dayMap.set(d, []);
    return dayMap.get(d)!;
  };
  for (const job of jobs) {
    if (!job.scheduled_date) continue;
    const assignments = job.work_order_assignments ?? [];
    if (assignments.length === 0) {
      ensure("", job.scheduled_date).push(job);
    } else {
      for (const a of assignments) {
        ensure(a.member_profile_id, job.scheduled_date).push(job);
      }
    }
  }

  const rows: Array<{ id: string; name: string; profile?: MemberProfile }> = [
    ...profiles.map((p) => ({ id: p.id, name: p.name, profile: p })),
    { id: "", name: "Unassigned" },
  ];

  async function handleDrop(profileId: string, date: string) {
    const id = dragJobId;
    setDragJobId(null);
    setDropTarget(null);
    if (!id) return;
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    const sameDay = job.scheduled_date === date;
    const existingIds = (job.work_order_assignments ?? []).map((a) => a.member_profile_id);
    const isAssigned = profileId === "" ? existingIds.length === 0 : existingIds.includes(profileId);
    if (sameDay && isAssigned) return;
    const nextAssignees = profileId === "" ? [] : Array.from(new Set([...existingIds.filter((p) => !!p), profileId]));
    try {
      await rescheduleJob(id, { scheduled_date: date, assignee_profile_ids: nextAssignees });
      toast.success("Job moved");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Move failed");
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="min-w-[900px]">
        {/* Header row */}
        <div className="grid grid-cols-[180px_repeat(7,minmax(0,1fr))] border-b bg-muted/30 sticky top-0 z-10">
          <div className="p-2 text-xs font-semibold text-muted-foreground">Worker</div>
          {days.map((d) => {
            const dt = new Date(d + "T00:00:00");
            const today = isToday(d);
            return (
              <div key={d} className={`p-2 text-center border-l ${today ? "bg-primary/10" : ""}`}>
                <div className="text-[10px] font-semibold text-muted-foreground">{DAY_LABELS[dt.getDay() === 0 ? 6 : dt.getDay() - 1]}</div>
                <div className={`text-sm font-bold ${today ? "text-primary" : ""}`}>{dt.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* Body rows */}
        {rows.map((row) => (
          <div key={row.id || "unassigned"} className="grid grid-cols-[180px_repeat(7,minmax(0,1fr))] border-b last:border-b-0">
            <div className="p-2 flex items-center gap-2 border-r bg-muted/10">
              {row.profile ? (
                <div className={`h-7 w-7 rounded-full ${avatarColor(row.id)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                  {initials(row.name)}
                </div>
              ) : (
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                  <UserCircle2 className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{row.name}</div>
                {row.profile?.role_title && <div className="text-[10px] text-muted-foreground truncate">{row.profile.role_title}</div>}
              </div>
            </div>
            {days.map((d) => {
              const cellJobs = grid.get(row.id)?.get(d) ?? [];
              const targetKey = `${row.id}|${d}`;
              const isDropTarget = dropTarget === targetKey && dragJobId !== null;
              return (
                <div
                  key={d}
                  onDragOver={(e) => { e.preventDefault(); setDropTarget(targetKey); }}
                  onDragLeave={() => setDropTarget((t) => t === targetKey ? null : t)}
                  onDrop={(e) => { e.preventDefault(); handleDrop(row.id, d); }}
                  className={`border-l p-1 min-h-[64px] space-y-1 transition-colors ${isDropTarget ? "bg-primary/10" : ""}`}
                >
                  {cellJobs.map((job) => (
                    <button
                      key={job.id + row.id}
                      draggable
                      onDragStart={() => setDragJobId(job.id)}
                      onDragEnd={() => { setDragJobId(null); setDropTarget(null); }}
                      onClick={() => onJobClick(job)}
                      className="w-full text-left rounded border bg-card p-1.5 text-[11px] hover:shadow-sm cursor-grab active:cursor-grabbing space-y-0.5"
                    >
                      <div className="flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT[job.status] ?? "bg-gray-400"}`} />
                        <span className="font-semibold truncate">{job.title}</span>
                      </div>
                      {(job.start_time || job.end_time) && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{formatTime(job.start_time)}{job.end_time ? `–${formatTime(job.end_time)}` : ""}</span>
                        </div>
                      )}
                      {job.property_address && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{job.property_address}</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
