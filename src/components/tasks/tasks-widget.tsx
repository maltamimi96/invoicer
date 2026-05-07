"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Columns3, ArrowRight, Plus, Check, Clock } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listTasks, moveTask, type Task, type TaskPriority } from "@/lib/actions/tasks";

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: "bg-rose-500",
  high:   "bg-amber-500",
  normal: "bg-blue-400",
  low:    "bg-zinc-400",
};

/** Small dashboard widget — shows the user's open tasks (todo + in-progress)
 *  with a one-click "complete" action. Pairs with the briefing widget on
 *  the left: briefing = system-generated work, tasks = user's own todos. */
export function TasksWidget() {
  const [tasks,   setTasks]   = useState<Task[] | null>(null);
  const [busy,    setBusy]    = useState<string | null>(null);

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
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Columns3 className="w-3.5 h-3.5 text-muted-foreground" />
          Your todos
          {tasks && tasks.length > 0 && (
            <span className="ch-pill in-progress">{tasks.length}</span>
          )}
        </h3>
        <Link href="/tasks" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Open board <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {tasks === null ? (
        <div className="p-4 text-xs text-muted-foreground">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="ch-empty">
          <div className="w-10 h-10 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-2">
            <Check className="w-5 h-5 text-emerald-600" />
          </div>
          <h4>Nothing on your list</h4>
          <p>Add a task or check the briefing for system-suggested work.</p>
          <Link href="/tasks" className="inline-block mt-2">
            <Button size="sm" variant="outline" className="gap-1.5"><Plus className="w-3 h-3" /> New task</Button>
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {tasks.map((t) => {
            const overdue = t.due_date && t.due_date < todayStr;
            return (
              <li key={t.id} className="px-4 py-2.5 flex items-start gap-3 group hover:bg-muted/30 transition-colors">
                <button
                  onClick={() => complete(t)}
                  disabled={busy === t.id}
                  className="mt-0.5 w-4 h-4 rounded-full border-2 border-border hover:border-emerald-500 hover:bg-emerald-500/10 flex-shrink-0 flex items-center justify-center transition-colors"
                  title="Mark done"
                  aria-label={`Mark "${t.title}" as done`}
                >
                  {busy === t.id && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                </button>
                <Link href="/tasks" className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority]}`} />
                    <p className="text-sm font-medium truncate">{t.title}</p>
                  </div>
                  {(t.due_date || t.tags?.length > 0) && (
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                      {t.due_date && (
                        <span className={`inline-flex items-center gap-1 ${overdue ? "text-rose-600" : ""}`}>
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
              </li>
            );
          })}
        </ul>
      )}

      {tasks && tasks.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border">
          <Link href="/tasks" className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline">
            <Plus className="w-3 h-3" /> Add task
          </Link>
        </div>
      )}
    </div>
  );
}
