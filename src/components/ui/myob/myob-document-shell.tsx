"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, PanelLeft } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useFocusMode } from "@/components/layout/focus-mode";

/**
 * MYOB-style document canvas: a sticky top action bar (title + actions + a
 * focus toggle that hides the app nav) over a single centered white "sheet".
 * A mobile sticky bottom bar mirrors the primary actions.
 *
 * Layout targets (from the plan): sheet max-width 1160px; action bar 56px;
 * sheet padding 32px desktop / 16px mobile; 28px rhythm between blocks.
 */
export interface MyobDocumentShellProps {
  title: React.ReactNode;
  backHref?: string;
  /** Desktop action-bar buttons (right-aligned). */
  actions?: React.ReactNode;
  /** Actions surfaced in the mobile sticky bottom bar. */
  mobileActions?: React.ReactNode;
  /** Show the Focus toggle (default true). */
  focusToggle?: boolean;
  children: React.ReactNode;
}

export function MyobDocumentShell({
  title,
  backHref,
  actions,
  mobileActions,
  focusToggle = true,
  children,
}: MyobDocumentShellProps) {
  const { focus, toggle } = useFocusMode();

  return (
    <div className="mx-auto w-full max-w-[1160px]">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-10 -mx-6 mb-6 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex min-w-0 items-center gap-2">
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          )}
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {focusToggle && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(focus && "text-primary")}
              onClick={toggle}
              aria-pressed={focus}
              title={focus ? "Exit focus mode" : "Focus mode"}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}
          {actions}
        </div>
      </div>

      {/* Document sheet */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-4 sm:p-8 space-y-7 mb-24 md:mb-8">
        {children}
      </div>

      {/* Mobile sticky bottom bar */}
      {mobileActions && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex h-14 items-center gap-2 border-t border-border bg-background/95 px-4 backdrop-blur md:hidden">
          {mobileActions}
        </div>
      )}
    </div>
  );
}

/**
 * The MYOB header block: customer column (flexes) + a fixed 320px meta column,
 * stacking below the `lg` breakpoint.
 */
export function MyobHeaderBlock({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(320px,1fr)_320px]">
      <div className="space-y-4">{left}</div>
      <div className="space-y-4">{right}</div>
    </div>
  );
}
