"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, RotateCcw, Check, Clock } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  getMyBriefing, snoozeBriefingItem,
  type BriefingItem, type BriefingSummary,
} from "@/lib/actions/briefing";

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

/** Header bell — shows a count badge of high-priority items + opens a
 *  popover with the same briefing UI as the dashboard widget. Polls every
 *  60s while open to stay current. */
export function BriefingBell() {
  const [open,    setOpen]    = useState(false);
  const [summary, setSummary] = useState<BriefingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setSummary(await getMyBriefing()); }
    finally { setLoading(false); }
  }, []);

  // Initial fetch on mount so the badge populates without opening.
  useEffect(() => { refresh(); }, [refresh]);

  // Light polling only when the popover is open.
  useEffect(() => {
    if (!open) return;
    refresh();
    pollRef.current = setInterval(refresh, 60_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, refresh]);

  const markDone = async (item: BriefingItem) => {
    try {
      await snoozeBriefingItem({ briefing_type: item.type, entity_id: item.entity_id, hours: 0 });
      toast.success("Marked done");
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
  };

  const snooze = async (item: BriefingItem, hours: number) => {
    try {
      await snoozeBriefingItem({ briefing_type: item.type, entity_id: item.entity_id, hours });
      toast.success(`Snoozed for ${hours}h`);
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
  };

  const totalCount = summary?.items.length ?? 0;
  const highCount  = summary?.items.filter((i) => i.priority === "high").length ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 relative"
          aria-label={`Briefing — ${totalCount} items`}
          title="Briefing"
        >
          <Sparkles className="w-4 h-4" />
          {totalCount > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-semibold leading-none ${
                highCount > 0
                  ? "bg-rose-500 text-white"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {totalCount > 99 ? "99+" : totalCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] sm:w-[420px] p-0 max-h-[70vh] overflow-hidden flex flex-col" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div>
            <p className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Your briefing
              {totalCount > 0 && <span className="ch-pill in-progress">{totalCount}</span>}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {totalCount === 0 ? "All caught up" : "What needs attention"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={refresh} disabled={loading} title="Refresh">
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {summary === null ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : totalCount === 0 ? (
          <div className="p-8 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-2">
              <Check className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-sm font-medium">Inbox zero</p>
            <p className="text-xs text-muted-foreground">Nothing overdue. Take a break.</p>
          </div>
        ) : (
          <div className="divide-y divide-border overflow-y-auto flex-1">
            {summary.items.slice(0, 12).map((item) => (
              <Row key={item.id} item={item} onClose={() => setOpen(false)} onMarkDone={markDone} onSnooze={snooze} />
            ))}
          </div>
        )}

        {totalCount > 0 && (
          <div className="px-4 py-2.5 border-t border-border flex-shrink-0 bg-muted/30">
            <Link
              href="/assistant"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
            >
              Open full briefing <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Row({
  item, onClose, onMarkDone, onSnooze,
}: {
  item: BriefingItem;
  onClose: () => void;
  onMarkDone: (item: BriefingItem) => void;
  onSnooze:   (item: BriefingItem, hours: number) => void;
}) {
  return (
    <div className={`group px-3 py-2.5 hover:bg-muted/40 transition-colors border-l-4 ${PRIORITY_TONE[item.priority]}`}>
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-12 flex-shrink-0 pt-0.5">
          {TYPE_LABEL[item.type]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate">{item.title}</p>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 mt-2">
        <button
          onClick={() => onSnooze(item, 24)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Snooze 24h"
        >
          <Clock className="w-3 h-3" /> Snooze
        </button>
        <button
          onClick={() => onMarkDone(item)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-emerald-700 hover:bg-emerald-50"
          title="Mark done — hide until something changes"
        >
          <Check className="w-3 h-3" /> Done
        </button>
        <Link
          href={item.action_url}
          onClick={onClose}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90"
        >
          {item.action_label} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
