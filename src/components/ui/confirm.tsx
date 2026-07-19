"use client";

/**
 * One confirmation dialog for the whole app.
 *
 * Two problems this replaces:
 *
 * 1. Destructive actions with NO confirmation at all — a 16px trash icon that
 *    permanently deletes a financial record, removes a team member, or (worst)
 *    deletes a booking resource, which CASCADEs to every appointment ever
 *    booked against it (appointments.resource_id ... ON DELETE CASCADE).
 *
 * 2. Native `window.confirm()` — which does technically confirm, but is
 *    unstyled, blocks the main thread, is suppressible by the browser ("prevent
 *    this page from creating additional dialogs"), and cannot show the one thing
 *    that matters: WHAT ELSE goes with it.
 *
 * The API deliberately mirrors `confirm()` so migrating a call site is nearly
 * mechanical:
 *
 *     if (!(await confirm({ title: "Delete this?" }))) return;
 */

import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmOptions {
  title: string;
  /** The consequence. Spell out anything that goes with it — cascades especially. */
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button. Default true: this exists for destructive actions. */
  destructive?: boolean;
}

type Ask = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((next) => {
    setOpts(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = (ok: boolean) => {
    setOpen(false);
    // Resolve after the state update so the caller never runs against a dialog
    // that is still visually open.
    const r = resolver.current;
    resolver.current = null;
    r?.(ok);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <AlertDialog
        open={open}
        // Covers Escape and outside-click, which must count as "cancel" rather
        // than leaving the promise dangling forever.
        onOpenChange={(v) => { if (!v) settle(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.body && <AlertDialogDescription>{opts.body}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {opts?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={opts?.destructive === false ? undefined : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            >
              {opts?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Ask the user to confirm. Resolves false on cancel, Escape or outside-click.
 *
 * Falls back to native confirm() when no provider is mounted — some surfaces
 * (the customer portal, the public booking manager) render outside the
 * dashboard shell, and a missing provider must not mean "no confirmation".
 */
export function useConfirm(): Ask {
  const ctx = useContext(ConfirmContext);
  return useCallback<Ask>(
    (opts) => {
      if (ctx) return ctx(opts);
      const text = opts.body ? `${opts.title}\n\n${opts.body}` : opts.title;
      return Promise.resolve(window.confirm(text));
    },
    [ctx],
  );
}
