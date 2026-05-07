"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Users2, Repeat, Bot, ArrowRight, ChevronRight } from "@/components/ui/icons";
import { getMembers } from "@/lib/actions/members";
import { getRecurringJobs } from "@/lib/actions/recurring-jobs";
import { listAgentInstalls, type AgentInstall } from "@/lib/actions/agents";
import type { BusinessMember, RecurringJob } from "@/types/database";

const AGENT_LABEL: Record<string, string> = {
  "daily-digest":     "Daily digest",
  "invoice-reminders":"Invoice reminders",
  "quote-followup":   "Quote follow-up",
  "workorder-complete":"Job complete",
  "recurring-jobs":   "Recurring jobs",
  reminders:          "Reminders",
};

/** Compact snapshot of operational state — team, recurring jobs, automations.
 *  Pairs the financial KPIs above with the *who/what/how* below them. */
export function OutlookWidget() {
  const [members,   setMembers]   = useState<BusinessMember[] | null>(null);
  const [recurring, setRecurring] = useState<RecurringJob[]   | null>(null);
  const [agents,    setAgents]    = useState<AgentInstall[]   | null>(null);

  const refresh = useCallback(async () => {
    const [m, r, a] = await Promise.all([
      getMembers().catch(() => []),
      getRecurringJobs().catch(() => []),
      listAgentInstalls().catch(() => []),
    ]);
    setMembers(m);
    setRecurring(r);
    setAgents(a);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const activeMembers = (members ?? []).filter((m) => m.status === "active");
  const pendingMembers = (members ?? []).filter((m) => m.status === "pending");
  const activeRecurring = (recurring ?? []).filter((r) => r.active);
  const activeAgents = (agents ?? []).filter((a) => a.enabled);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Operations</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Team, recurring jobs, automations</p>
      </div>

      <div className="divide-y divide-border">
        {/* Team */}
        <Link href="/team" className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group">
          <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
            <Users2 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Team</p>
            <p className="text-xs text-muted-foreground truncate">
              {members === null ? "Loading…"
                : activeMembers.length === 0 ? "No team members yet"
                : `${activeMembers.length} active${pendingMembers.length ? ` · ${pendingMembers.length} pending` : ""}`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors flex-shrink-0" />
        </Link>

        {/* Recurring */}
        <Link href="/recurring" className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group">
          <div className="w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
            <Repeat className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Recurring jobs</p>
            <p className="text-xs text-muted-foreground truncate">
              {recurring === null ? "Loading…"
                : activeRecurring.length === 0 ? "None set up"
                : `${activeRecurring.length} active`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors flex-shrink-0" />
        </Link>

        {/* Agents */}
        <Link href="/agents" className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Agents running</p>
            <p className="text-xs text-muted-foreground truncate">
              {agents === null ? "Loading…"
                : activeAgents.length === 0 ? "No automations on"
                : activeAgents.slice(0, 3).map((a) => AGENT_LABEL[a.agent_id] ?? a.agent_id).join(" · ") + (activeAgents.length > 3 ? ` +${activeAgents.length - 3}` : "")}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors flex-shrink-0" />
        </Link>
      </div>

      <div className="px-4 py-2.5 border-t border-border">
        <Link href="/team" className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline">
          Manage <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
