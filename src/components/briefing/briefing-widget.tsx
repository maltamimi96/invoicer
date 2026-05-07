"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Sparkles, AlertTriangle, ArrowRight, RotateCcw, X, Clock } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getMyBriefing, snoozeBriefingItem, type BriefingItem, type BriefingSummary } from "@/lib/actions/briefing";

const PRIORITY_TONE: Record<BriefingItem["priority"], string> = {
  high: "border-l-rose-500",
  med:  "border-l-amber-500",
  low:  "border-l-blue-400",
};

const TYPE_LABEL: Record<BriefingItem["type"], string> = {
  overdue_invoice:      "Chase",
  stale_quote:          "Follow up",
  draft_quote:          "Send",
  new_lead:             "Call",
  stale_lead:           "Re-engage",
  job_today:            "Today",
  job_today_unassigned: "Assign",
  submitted_workorder:  "Review",
  completed_unbilled:   "Invoice",
};

interface Props {
  /** When true, shows only the top 5 + a 'See all' link. False shows everything. */
  compact?: boolean;
}

export function BriefingWidget({ compact = false }: Props) {
  const [summary, setSummary] = useState<BriefingSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await getMyBriefing());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const snooze = async (item: BriefingItem, hours: number) => {
    try {
      await snoozeBriefingItem({ briefing_type: item.type, entity_id: item.entity_id, hours });
      toast.success(hours === 0 ? "Dismissed" : `Snoozed for ${hours}h`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    }
  };

  if (!summary) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Preparing your briefing…
      </div>
    );
  }

  const items = compact ? summary.items.slice(0, 5) : summary.items;
  const empty = items.length === 0;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Your briefing
            {summary.items.length > 0 && (
              <span className="ch-pill in-progress">{summary.items.length}</span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {empty ? "All caught up — nice work." : "What needs attention right now"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={refresh} disabled={loading}>
            <RotateCcw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {compact && summary.items.length > 5 && (
            <Link href="/assistant" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              See all <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>

      {empty ? (
        <div className="p-8 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-sm font-medium">Your inbox is zero</p>
          <p className="text-xs text-muted-foreground">Nothing overdue, nothing stale. Take a break.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <Row key={item.id} item={item} onSnooze={snooze} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ item, onSnooze }: { item: BriefingItem; onSnooze: (item: BriefingItem, hours: number) => void }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group border-l-4 ${PRIORITY_TONE[item.priority]}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-12 flex-shrink-0">
        {TYPE_LABEL[item.type]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onSnooze(item, 24)}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Snooze 24h"
        >
          <Clock className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onSnooze(item, 0)}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <Link
          href={item.action_url}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
        >
          {item.action_label} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

/** Compact alert banner — shows just the count of high-priority items.
 *  Use on the dashboard above the KPI strip. */
export function BriefingAlert() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    getMyBriefing()
      .then((s) => setCount(s.items.filter((i) => i.priority === "high").length))
      .catch(() => setCount(0));
  }, []);

  if (count == null || count === 0) return null;

  return (
    <Link href="/assistant" className="block mb-5">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 hover:bg-rose-100/60 dark:hover:bg-rose-950/50 transition-colors">
        <div className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-rose-900 dark:text-rose-200 leading-tight">
            {count} {count === 1 ? "item needs" : "items need"} your attention
          </p>
          <p className="text-xs text-rose-700/80 dark:text-rose-300/70">Open your briefing to clear them</p>
        </div>
        <ArrowRight className="w-4 h-4 text-rose-700 dark:text-rose-300" />
      </div>
    </Link>
  );
}
