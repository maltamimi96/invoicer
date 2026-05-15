"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Users2, Repeat, Bot, ArrowRight } from "@/components/ui/icons";
import { getMembers } from "@/lib/actions/members";
import { getRecurringJobs } from "@/lib/actions/recurring-jobs";
import { listAgentInstalls, type AgentInstall } from "@/lib/actions/agents";
import { GradientTile, CardListRow } from "@/components/ui/kirei";
import type { BusinessMember, RecurringJob } from "@/types/database";

const AGENT_LABEL: Record<string, string> = {
  "daily-digest":      "Daily digest",
  "invoice-reminders": "Invoice reminders",
  "quote-followup":    "Quote follow-up",
  "workorder-complete":"Job complete",
  "recurring-jobs":    "Recurring jobs",
  reminders:           "Reminders",
};

/** Compact snapshot of operational state — team, recurring jobs, automations. */
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

  const activeMembers   = (members   ?? []).filter((m) => m.status === "active");
  const pendingMembers  = (members   ?? []).filter((m) => m.status === "pending");
  const activeRecurring = (recurring ?? []).filter((r) => r.active);
  const activeAgents    = (agents    ?? []).filter((a) => a.enabled);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <GradientTile gradient="ocean" size={32} radius={8}>
          <Bot className="w-4 h-4" />
        </GradientTile>
        <div>
          <h3 className="text-sm font-semibold">Operations</h3>
          <p className="text-xs text-muted-foreground">Team · Recurring · Automations</p>
        </div>
      </div>

      <div className="p-2 space-y-1.5">
        <CardListRow
          href="/team"
          gradient="blue"
          icon={<Users2 className="w-4 h-4" />}
          title="Team"
          meta={members === null ? "Loading…"
              : activeMembers.length === 0 ? "No team members yet"
              : `${activeMembers.length} active${pendingMembers.length ? ` · ${pendingMembers.length} pending` : ""}`}
        />
        <CardListRow
          href="/recurring"
          gradient="violet"
          icon={<Repeat className="w-4 h-4" />}
          title="Recurring jobs"
          meta={recurring === null ? "Loading…"
              : activeRecurring.length === 0 ? "None set up"
              : `${activeRecurring.length} active`}
        />
        <CardListRow
          href="/agents"
          gradient="emerald"
          icon={<Bot className="w-4 h-4" />}
          title="Agents running"
          meta={agents === null ? "Loading…"
              : activeAgents.length === 0 ? "No automations on"
              : activeAgents.slice(0, 3).map((a) => AGENT_LABEL[a.agent_id] ?? a.agent_id).join(" · ")
              + (activeAgents.length > 3 ? ` +${activeAgents.length - 3}` : "")}
        />
      </div>

      <div className="px-5 py-3 border-t border-border">
        <Link href="/team" className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
          Manage <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
