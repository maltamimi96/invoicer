"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Columns3, ArrowRight, Plus, Check, Clock } from "@/components/ui/icons";
import { toast } from "sonner";
import { GradientTile, EmptyState, SkeletonRow, AnimatedPress } from "@/components/ui/kirei";
import { listTasks, moveTask, type Task, type TaskPriority } from "@/lib/actions/tasks";

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: "bg-rose-500",
  high:   "bg-amber-500",
  normal: "bg-blue-400",
  low:    "bg-zinc-400",
};

/** Small dashboard widget — shows the user's open tasks with a one-click
 *  "complete" action. */
export function TasksWidget() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [busy,  setBusy]  = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await listTasks();
      setTasks(all.filter((t) => t.status !== "done").slice(0, 6));
    } catch { /* swallow — empty state is fine */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const complete = async (task: Task) => {
    setBusy(task.id);
    try {
      await moveTask({ id: task.id, status: "done", position: 0 });
      toast.success("Marked done");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    } finally {
      setBusy(null);
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <GradientTile gradient="violet" size={32} radius={8}>
            <Columns3 className="w-4 h-4" />
          </GradientTile>
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Your todos
              {tasks && tasks.length > 0 && (
                <span className="text-[10px] uppercase tracking-wide font-semibold bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200 px-1.5 py-0.5 rounded-full">
                  {tasks.length}
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">Open tasks on your kanban</p>
          </div>
        </div>
        <Link href="/tasks" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Open board <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {tasks === null ? (
        <div className="p-2 space-y-1.5"><SkeletonRow /><SkeletonRow /></div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<Check className="w-7 h-7" />}
          gradient="emerald"
          title="Nothing on your list"
          hint="Add a task or check the briefing for system-suggested work."
          cta={{ label: "New task", href: "/tasks", icon: <Plus className="w-4 h-4" /> }}
        />
      ) : (
        <div className="p-2 space-y-1.5">
          {tasks.map((t) => {
            const overdue = t.due_date && t.due_date < todayStr;
            return (
              <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border/70 hover:border-primary/30 transition-colors group">
                <button
                  onClick={() => complete(t)}
                  disabled={busy === t.id}
                  className="mt-0.5 w-5 h-5 rounded-full border-2 border-border hover:border-emerald-500 hover:bg-emerald-500/10 flex-shrink-0 flex items-center justify-center transition-colors"
                  title="Mark done"
                  aria-label={`Mark "${t.title}" as done`}
                >
                  {busy === t.id && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                </button>
                <Link href="/tasks" className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority]}`} />
                    <p className="text-sm font-medium break-words">{t.title}</p>
                  </div>
                  {(t.due_date || t.tags?.length > 0) && (
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                      {t.due_date && (
                        <span className={`inline-flex items-center gap-1 ${overdue ? "text-rose-600 font-semibold" : ""}`}>
                          <Clock className="w-3 h-3" />
                          {overdue ? `${t.due_date} (overdue)` : t.due_date}
                        </span>
                      )}
                      {t.tags?.slice(0, 2).map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 rounded bg-muted">{tag}</span>
                      ))}
                    </div>
                  )}
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {tasks && tasks.length > 0 && (
        <div className="px-5 py-3 border-t border-border">
          <Link href="/tasks">
            <AnimatedPress className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Add task
            </AnimatedPress>
          </Link>
        </div>
      )}
    </div>
  );
}
