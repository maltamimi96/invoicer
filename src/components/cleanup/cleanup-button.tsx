"use client";

import { useState } from "react";
import { Sparkles } from "@/components/ui/icons";
import { CleanupModal } from "./cleanup-modal";
import type { CleanupEntity } from "@/lib/actions/cleanup";

/**
 * Drop-in button that opens the AI cleanup flow for the given entity.
 * Use it in any list page's <PageHeader actions={...}> alongside the
 * primary "New X" button.
 */
export function CleanupButton({
  entity,
  entityLabel,
  className = "",
}: {
  entity: CleanupEntity;
  entityLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/30 bg-[hsl(var(--primary)/0.08)] text-primary text-sm font-medium hover:bg-[hsl(var(--primary)/0.14)] transition-colors " +
          className
        }
        title={`Clean up ${entityLabel}`}
      >
        <Sparkles className="w-3.5 h-3.5" /> Clean up
      </button>
      <CleanupModal open={open} onOpenChange={setOpen} entity={entity} entityLabel={entityLabel} />
    </>
  );
}
