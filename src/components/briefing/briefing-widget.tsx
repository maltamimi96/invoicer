"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Sparkles, AlertTriangle, ArrowRight, RotateCcw, Check, Clock } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GradientTile, EmptyState, AnimatedPress } from "@/components/ui/kirei";
import type { GradientName } from "@/components/ui/kirei";
import { getMyBriefing, snoozeBriefingItem, type BriefingItem, type BriefingSummary } from "@/lib/actions/briefing";

const PRIORITY_GRADIENT: Record<BriefingItem["priority"], GradientName> = {
  high: "rose",
  med:  "amber",
  low:  "blue",
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
  /** When true, shows only the top 5 + a 'See all' link. */
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
      toast.success(hours === 0 ? "Marked done" : `Snoozed for ${hours}h`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    }
  };

  if (!summary) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm p-5 flex items-center gap-3 text-sm text-muted-foreground">
        <GradientTile gradient="dusk" size={32} radius={8}>
          <Sparkles className="w-4 h-4 animate-pulse" />
        </GradientTile>
        Preparing your briefing…
      </div>
    );
  }

  const items = compact ? summary.items.slice(0, 5) : summary.items;
  const empty = items.length === 0;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <GradientTile gradient="dusk" size={32} radius={8}>
            <Sparkles className="w-4 h-4" />
          </GradientTile>
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Your briefing
              {summary.items.length > 0 && (
                <span className="text-[10px] uppercase tracking-wide font-bold bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200 px-1.5 py-0.5 rounded-full">
                  {summary.items.length}
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              {empty ? "All caught up — nice work." : "What needs attention right now"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={refresh} disabled={loading}>
            <RotateCcw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {compact && summary.items.length > 5 && (
            <Link href="/assistant" className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1">
              See all <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>

      {empty ? (
        <EmptyState
          icon={<Sparkles className="w-7 h-7" />}
          gradient="emerald"
          title="Your inbox is zero"
          hint="Nothing overdue, nothing stale. Take a break."
        />
      ) : (
        <div className="p-2 space-y-1.5">
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
    <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-card border border-border/70 hover:border-primary/30 transition-colors group">
      <GradientTile gradient={PRIORITY_GRADIENT[item.priority]} size={36} radius={10}>
        <span className="text-[9px] font-bold uppercase tracking-wider">
          {TYPE_LABEL[item.type].slice(0, 4)}
        </span>
      </GradientTile>
      <div className="flex-1 min-w-[140px] basis-0">
        <p className="text-sm font-semibold break-words">{item.title}</p>
        <p className="text-xs text-muted-foreground break-words">{item.subtitle}</p>
      </div>
      <div className="flex items-center gap-1 ml-auto flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onSnooze(item, 24)}
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground text-xs"
          title="Snooze 24h"
          aria-label="Snooze 24h"
        >
          <Clock className="w-3.5 h-3.5" /><span className="hidden sm:inline">Snooze</span>
        </button>
        <button
          onClick={() => onSnooze(item, 0)}
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs"
          title="Mark done"
          aria-label="Mark done"
        >
          <Check className="w-3.5 h-3.5" /><span className="hidden sm:inline">Done</span>
        </button>
        <Link href={item.action_url}>
          <AnimatedPress className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold cursor-pointer">
            {item.action_label} <ArrowRight className="w-3 h-3" />
          </AnimatedPress>
        </Link>
      </div>
    </div>
  );
}

/** Compact alert banner — shows just the count of high-priority items. */
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
      <AnimatedPress className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40">
        <GradientTile gradient="rose" size={40} radius={10}>
          <AlertTriangle className="w-4 h-4" />
        </GradientTile>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-rose-900 dark:text-rose-200 leading-tight">
            {count} {count === 1 ? "item needs" : "items need"} your attention
          </p>
          <p className="text-xs text-rose-700/80 dark:text-rose-300/70">Open your briefing to clear them</p>
        </div>
        <ArrowRight className="w-4 h-4 text-rose-700 dark:text-rose-300" />
      </AnimatedPress>
    </Link>
  );
}
