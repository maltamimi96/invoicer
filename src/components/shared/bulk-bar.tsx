"use client";

import { Trash2, X } from "@/components/ui/icons";

/** Selection action bar shown when one or more rows are ticked in a list. */
export function BulkBar({ count, onDelete, onClear, busy, noun = "item", extra }: {
  count: number;
  onDelete: () => void;
  onClear: () => void;
  busy?: boolean;
  noun?: string;
  /** Extra action(s) (e.g. a bulk status selector) shown before Delete. */
  extra?: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5 flex-wrap">
      <span className="text-sm font-medium">{count} {noun}{count === 1 ? "" : "s"} selected</span>
      <div className="ml-auto flex items-center gap-2 flex-wrap">
        {extra}
        <button
          onClick={onDelete}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-60"
        >
          <Trash2 className="w-3.5 h-3.5" /> {busy ? "Deleting…" : "Delete selected"}
        </button>
        <button onClick={onClear} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border bg-card text-sm text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" /> Clear
        </button>
      </div>
    </div>
  );
}
