"use client";

/**
 * Watching a hunt run.
 *
 * A hunt is minutes of work and used to show nothing until it finished, which
 * is indistinguishable from a hang — the user's words were "we need a progress
 * bar to show what's happening".
 *
 * So the run is started on the server and this polls it: a bar for the current
 * stage, and the agent's own narration underneath. The log is the honest part —
 * "12 found, 3 new" and "Ace Plumbing — 82% · sole trader, no website" tell you
 * the thing is working AND whether it's finding the right sort of business,
 * while there's still time to stop it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { CheckCircle, AlertTriangle, XCircle, Info } from "@/components/ui/icons";
import { getRunProgress } from "@/lib/actions/prospecting";
import type {
  ProspectHuntRun, ProspectHuntEvent, ProspectHuntStage, ProspectCandidate,
} from "@/types/database";

const STAGES: { key: ProspectHuntStage; label: string }[] = [
  { key: "queued", label: "Starting" },
  { key: "searching", label: "Searching" },
  { key: "screening", label: "Filtering" },
  { key: "verifying", label: "Checking each one" },
  { key: "auditing", label: "Reviewing the run" },
];

const LEVEL_ICON = {
  success: CheckCircle,
  warn: AlertTriangle,
  error: XCircle,
  info: Info,
} as const;

const LEVEL_TONE = {
  success: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-destructive",
  info: "text-muted-foreground",
} as const;

interface Props {
  runId: string;
  /** Fires once the run reaches a terminal state, so the page can refresh. */
  onFinished?: (run: ProspectHuntRun) => void;
}

export function HuntProgress({ runId, onFinished }: Props) {
  const [run, setRun] = useState<ProspectHuntRun | null>(null);
  const [events, setEvents] = useState<ProspectHuntEvent[]>([]);
  const [verified, setVerified] = useState<ProspectCandidate[]>([]);
  const since = useRef<string | undefined>(undefined);
  const finished = useRef(false);
  const logEnd = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const p = await getRunProgress(runId, since.current);
      if (p.run) setRun(p.run);
      if (p.verified.length) setVerified(p.verified);
      if (p.events.length) {
        since.current = p.events[p.events.length - 1].created_at;
        setEvents((prev) => [...prev, ...p.events]);
      }
      // Terminal states only. `stage` reaching "finished" without the status
      // moving would leave the poller running forever.
      if (p.run && p.run.status !== "running" && !finished.current) {
        finished.current = true;
        onFinished?.(p.run);
      }
    } catch {
      // A dropped poll is not worth a toast — the next tick recovers.
    }
  }, [runId, onFinished]);

  useEffect(() => {
    void poll();
    const id = setInterval(() => {
      if (finished.current) { clearInterval(id); return; }
      void poll();
    }, 2000);
    return () => clearInterval(id);
  }, [poll]);

  // Follow the log, the way a terminal does.
  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [events.length]);

  const stage = run?.stage ?? "queued";
  const stageIndex = Math.max(0, STAGES.findIndex((s) => s.key === stage));
  const isRunning = !run || run.status === "running";

  // Within-stage progress where we have it; otherwise the stage itself is the
  // unit. A bar that sits at 0 through the slowest stage is worse than none.
  const pct = run && run.total > 0
    ? Math.min(100, (run.processed / run.total) * 100)
    : ((stageIndex + (isRunning ? 0.5 : 1)) / STAGES.length) * 100;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          {isRunning && <Spinner size="sm" />}
          {isRunning
            ? STAGES[stageIndex]?.label ?? "Working"
            : run?.status === "done" ? "Finished" : run?.status === "cancelled" ? "Stopped" : "Failed"}
        </p>
        {run && run.total > 0 && isRunning && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {run.processed} / {run.total}
          </span>
        )}
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full transition-[width] duration-500",
            run?.status === "failed" ? "bg-destructive"
              : run?.status === "cancelled" ? "bg-amber-500" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {STAGES.map((s, i) => (
          <span key={s.key} className={cn(i === stageIndex && isRunning && "text-foreground font-medium",
            i < stageIndex && "line-through opacity-60")}>
            {s.label}
          </span>
        ))}
      </div>

      {run && !isRunning && (
        <div className="ch-stat-grid mt-4">
          <div className="ch-stat"><span>Found</span><strong>{run.found}</strong></div>
          <div className="ch-stat"><span>Filtered out</span><strong>{run.screened_out}</strong></div>
          <div className="ch-stat"><span>Not a fit</span><strong>{run.rejected}</strong></div>
          <div className="ch-stat"><span>To review</span><strong>{run.verified}</strong></div>
          <div className="ch-stat">
            <span>Cost</span><strong>${(Number(run.cost_cents) / 100).toFixed(2)}</strong>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="ch-scroll mt-3 max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
          <ul className="space-y-1.5 text-sm">
            {events.map((e) => {
              const Icon = LEVEL_ICON[e.level] ?? Info;
              return (
                <li key={e.id} className="flex items-start gap-2">
                  <Icon className={cn("mt-0.5 w-3.5 h-3.5 shrink-0", LEVEL_TONE[e.level])} />
                  <span className="break-words">{e.message}</span>
                </li>
              );
            })}
          </ul>
          <div ref={logEnd} />
        </div>
      )}

      {isRunning && verified.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {verified.length} queued for review so far.
        </p>
      )}
    </div>
  );
}

/** Kick off a run. Returns the run id to watch, or null if it couldn't start. */
export async function startHunt(huntId: string): Promise<string | null> {
  try {
    const res = await fetch("/api/prospecting/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hunt_id: huntId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? "Couldn't start the hunt");
      return null;
    }
    if (json.already_running) toast.info("That hunt is already running — showing it");
    return json.run_id ?? null;
  } catch {
    toast.error("Couldn't reach the server");
    return null;
  }
}
