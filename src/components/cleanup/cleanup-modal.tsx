"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, AlertTriangle, Check, RotateCcw } from "@/components/ui/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  proposeCleanup, applyCleanup, undoCleanup,
  type CleanupEntity, type ProposedChange,
} from "@/lib/actions/cleanup";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: CleanupEntity;
  /** Display label, e.g. "customers" */
  entityLabel: string;
}

type Stage = "analyzing" | "review" | "applying" | "done" | "empty";

export function CleanupModal({ open, onOpenChange, entity, entityLabel }: Props) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const [stage,     setStage]     = useState<Stage>("analyzing");
  const [proposals, setProposals] = useState<ProposedChange[]>([]);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [totalRows, setTotalRows] = useState<number>(0);
  const [runId,     setRunId]     = useState<string | null>(null);
  const [appliedCount, setApplied] = useState(0);
  /** 0–100. Animated separately from the actual server work — we drive it
   *  with rAF so the user sees movement even when the server takes a beat. */
  const [progress, setProgress] = useState(0);

  // Animated progress: climbs from 0 to ~92% over the analyze/apply window
  // then snaps to 100% when the work returns. Pure rAF, no deps.
  useEffect(() => {
    if (stage !== "analyzing" && stage !== "applying") return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      const eased = 1 - Math.pow(1 - t, 2);
      setProgress(8 + 84 * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  // Generate proposals each time the modal opens
  useEffect(() => {
    if (!open) return;
    setStage("analyzing");
    setSelected(new Set());
    setProposals([]);
    setRunId(null);
    setApplied(0);
    setProgress(0);

    (async () => {
      try {
        const { proposals, total_rows } = await proposeCleanup(entity);
        setTotalRows(total_rows);
        setProposals(proposals);
        setProgress(100);
        if (proposals.length === 0) {
          setStage("empty");
        } else {
          // Pre-select all by default — user can untick the ones they don't want.
          setSelected(new Set(proposals.map((p) => p.change_id)));
          setStage("review");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't analyze");
        onOpenChange(false);
      }
    })();
  }, [open, entity, onOpenChange]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const apply = async () => {
    if (selected.size === 0) return;
    setStage("applying");
    setProgress(0);
    try {
      const { run_id, applied } = await applyCleanup(entity, proposals, [...selected]);
      setRunId(run_id);
      setApplied(applied);
      setProgress(100);
      setStage("done");
      // Refetch so the page picks up the changes immediately.
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't apply changes");
      setStage("review");
    }
  };

  const undo = async () => {
    if (!runId) return;
    try {
      const { reverted } = await undoCleanup(runId);
      toast.success(`Undid ${reverted} change${reverted === 1 ? "" : "s"}`);
      onOpenChange(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't undo");
    }
  };

  // Always refetch when the modal closes after a successful run, so list
  // components that hold their own useState(initial) pick up the new data.
  const handleOpenChange = (next: boolean) => {
    if (!next && stage === "done") {
      refresh();
    }
    onOpenChange(next);
  };

  const grouped = {
    high: proposals.filter((p) => p.severity === "high"),
    med:  proposals.filter((p) => p.severity === "med"),
    low:  proposals.filter((p) => p.severity === "low"),
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Smart Organise · {entityLabel}
          </DialogTitle>
          <DialogDescription>
            {stage === "analyzing" && "Scanning for duplicates, empty rows, and fields to tidy…"}
            {stage === "review"    && `${proposals.length} suggested change${proposals.length === 1 ? "" : "s"} across ${totalRows} ${entityLabel}. Untick anything you'd rather keep.`}
            {stage === "applying"  && "Applying your selections…"}
            {stage === "done"      && `Applied ${appliedCount} change${appliedCount === 1 ? "" : "s"}. You can undo this run if anything looks off.`}
            {stage === "empty"     && `Nothing to organise — all ${totalRows} ${entityLabel} look healthy.`}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar — visible during analyzing + applying */}
        {(stage === "analyzing" || stage === "applying") && (
          <div className="h-1 -mt-2 mb-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-200 ease-out"
              style={{ width: `${progress}%`, boxShadow: "0 0 8px hsl(var(--primary) / 0.5)" }}
            />
          </div>
        )}

        <AnimatePresence mode="wait">
          {stage === "analyzing" && (
            <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-12 gap-3">
              <Spinner size="lg" className="text-primary" />
              <p className="text-sm text-muted-foreground">Looking at every row…</p>
            </motion.div>
          )}

          {stage === "empty" && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-12 gap-2">
              <Check className="w-8 h-8 text-emerald-600" />
              <p className="text-sm font-medium">Everything looks good.</p>
              <button
                onClick={() => onOpenChange(false)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted"
              >Close</button>
            </motion.div>
          )}

          {stage === "review" && (
            <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto pr-1 flex-1 space-y-4">
                {grouped.high.length > 0 && <Group label="Merge duplicates"  tone="high" items={grouped.high} selected={selected} onToggle={toggle} />}
                {grouped.med.length  > 0 && <Group label="Delete / archive"  tone="med"  items={grouped.med}  selected={selected} onToggle={toggle} />}
                {grouped.low.length  > 0 && <Group label="Tidy fields"       tone="low"  items={grouped.low}  selected={selected} onToggle={toggle} />}
              </div>
              <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-border flex-shrink-0">
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelected(new Set())}
                >Deselect all</button>
                <div className="flex gap-2">
                  <button
                    onClick={() => onOpenChange(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted"
                  >Cancel</button>
                  <button
                    onClick={apply}
                    disabled={selected.size === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Apply {selected.size} change{selected.size === 1 ? "" : "s"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {stage === "applying" && (
            <motion.div key="applying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-12 gap-3">
              <Spinner size="lg" className="text-primary" />
              <p className="text-sm text-muted-foreground">Applying changes…</p>
            </motion.div>
          )}

          {stage === "done" && (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-700 dark:text-emerald-300" />
              </div>
              <p className="text-sm font-medium">Done — {appliedCount} change{appliedCount === 1 ? "" : "s"} applied.</p>
              <p className="text-xs text-muted-foreground text-center max-w-sm">If anything looks wrong, hit Undo to roll back this whole run.</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={undo}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Undo this cleanup
                </button>
                <button
                  onClick={() => onOpenChange(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
                >Done</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function Group({
  label, tone, items, selected, onToggle,
}: {
  label: string;
  tone: "high" | "med" | "low";
  items: ProposedChange[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const dotClass =
    tone === "high" ? "bg-rose-500"   :
    tone === "med"  ? "bg-amber-500" :
                      "bg-muted-foreground";
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground">· {items.length}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((p) => (
          <li key={p.change_id}>
            <label className="flex gap-3 items-start p-3 rounded-md border border-border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={selected.has(p.change_id)}
                onChange={() => onToggle(p.change_id)}
                className="mt-0.5 w-4 h-4 rounded border-border accent-primary cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium flex items-center gap-2">
                  {tone === "high" && <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                  {p.label}
                </div>
                {p.detail && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{p.detail}</p>}
              </div>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
