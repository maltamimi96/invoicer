"use client";

/**
 * Run a server action, then wait — visibly — for the list to catch up.
 *
 * THE BUG THIS EXISTS TO FIX, because it is subtle and it is everywhere:
 *
 *     startTransition(async () => {
 *       await deleteThing();
 *       router.refresh();        // ← NOT inside the transition any more
 *     });
 *
 * `startTransition` only tracks what happens in its SYNCHRONOUS scope. After
 * the first `await` you have left it, so `router.refresh()` runs untracked and
 * `isPending` drops to false the instant the action resolves — while the
 * server is still re-rendering. Buttons re-enable, spinners stop, and the row
 * you just deleted is still sitting there. It reads as "nothing happened, then
 * it randomly updated".
 *
 * The refresh is the slow part — a server round-trip — and it was the one part
 * with no indicator.
 *
 * So: the action runs, then `router.refresh()` is called inside a FRESH
 * synchronous transition, which React does track. `pending` stays true until
 * the new server output actually commits, and the global scrim
 * (AppLoadingProvider) covers the whole span so there is never a moment where
 * the app looks idle while work is in flight.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAppLoading } from "@/components/layout/app-loading";

export interface MutationOptions {
  /** Shown in the global busy pill. Say what is happening: "Deleting…". */
  busy?: string;
  /** Toast on success. Omit for silent operations. */
  success?: string;
  /** Prefix for the error toast; the thrown message is appended. */
  error?: string;
  /** Skip the refresh — for actions that navigate away instead. */
  refresh?: boolean;
}

export function useMutation() {
  const router = useRouter();
  const { setBusy } = useAppLoading();
  const [isRefreshing, startTransition] = useTransition();
  const [isRunning, setIsRunning] = useState(false);
  const armed = useRef(false);

  // Clear the scrim only once a refresh we started has finished. Without the
  // `armed` guard this fires on mount, when isRefreshing is already false.
  useEffect(() => {
    if (isRefreshing) { armed.current = true; return; }
    if (armed.current) { armed.current = false; setBusy(null); }
  }, [isRefreshing, setBusy]);

  const run = useCallback(async <T,>(
    fn: () => Promise<T>,
    opts: MutationOptions = {},
  ): Promise<T | undefined> => {
    const { busy = "Working…", success, error = "Couldn't do that", refresh = true } = opts;
    setIsRunning(true);
    setBusy(busy);
    try {
      const result = await fn();
      if (success) toast.success(success);
      if (refresh) {
        // Synchronous scope — this is the whole point of the file.
        startTransition(() => { router.refresh(); });
      } else {
        setBusy(null);
      }
      return result;
    } catch (e) {
      // Failure clears immediately: there is no refresh coming to wait for.
      setBusy(null);
      toast.error(`${error}: ${e instanceof Error ? e.message : "unknown error"}`);
      return undefined;
    } finally {
      setIsRunning(false);
    }
  }, [router, setBusy]);

  return {
    run,
    /** True from the click until the refreshed list is on screen. */
    pending: isRunning || isRefreshing,
  };
}


/**
 * A `router.refresh()` that is actually tracked, plus the global busy scrim.
 *
 * The minimal fix for the 20-odd call sites shaped like:
 *
 *     startTransition(async () => {
 *       await doThing();
 *       router.refresh();     // untracked — see the note at the top
 *     });
 *
 * Swap `router.refresh()` for this `refresh()` and the wait becomes visible:
 * it runs inside its own synchronous transition, and raises the scrim until
 * the new server output commits. One line per site, no restructuring of
 * error handling or toasts that already work.
 *
 * Prefer `useMutation` for new code — it owns the whole operation. This exists
 * so existing call sites can be corrected without being rewritten.
 *
 * Pass `null` when the caller already manages the scrim itself (the business
 * switcher has its own label and a stall timeout). Two owners of one overlay
 * means a label that changes mid-action and a clear that races.
 */
export function useTrackedRefresh(label: string | null = "Updating…") {
  const router = useRouter();
  const { setBusy } = useAppLoading();
  const [pending, startTransition] = useTransition();
  const armed = useRef(false);

  useEffect(() => {
    if (label === null) return;          // caller owns the overlay
    if (pending) { armed.current = true; return; }
    if (armed.current) { armed.current = false; setBusy(null); }
  }, [pending, setBusy, label]);

  const refresh = useCallback(() => {
    if (label !== null) setBusy(label);
    startTransition(() => { router.refresh(); });
  }, [router, setBusy, label]);

  return { refresh, pending };
}
