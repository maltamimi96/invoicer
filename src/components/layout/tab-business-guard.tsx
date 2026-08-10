"use client";

/**
 * Keeps each browser tab on its own business.
 *
 * The active business is a cookie, which is per-BROWSER, not per-tab. Open
 * Crown in a second tab and the first tab — still showing Connected Studio —
 * starts writing to Crown. Wrong data on screen is bad; a save landing in the
 * wrong business is worse.
 *
 * So each tab remembers its business in sessionStorage (which IS per-tab) and
 * re-asserts it whenever you come back to it. The tab you're looking at wins,
 * which is what a tab is supposed to mean.
 *
 * It re-asserts on focus rather than continuously because that's the only
 * moment that matters: you have to focus a tab to act in it, and the cookie
 * travels with the request. A background tab may be showing the other
 * business, but it can't be used without being focused first.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { setActiveBusiness } from "@/lib/actions/business";
import { readBusinessHint } from "@/lib/business-cookie";

const KEY = "kirei.tab.business";

export function TabBusinessGuard({ businessId }: { businessId: string }) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  // One re-assert at a time: the action + refresh is a round trip, and focus
  // can fire twice (visibilitychange then focus) for a single tab switch.
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const reassert = async () => {
      if (busy.current || cancelled) return;

      let mine: string | null = null;
      try { mine = sessionStorage.getItem(KEY); } catch { return; } // private mode

      // First render in this tab: adopt whatever the server just gave us.
      if (!mine) {
        try { sessionStorage.setItem(KEY, businessId); } catch { /* ignore */ }
        return;
      }
      if (mine === readBusinessHint()) return; // cookie already ours

      busy.current = true;
      try {
        await setActiveBusiness(mine);
        if (!cancelled) refresh();
      } catch {
        // The remembered business is gone or belongs to another account —
        // e.g. signed in as someone else in this tab. Forget it and let the
        // cookie stand rather than retrying on every focus forever.
        try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      } finally {
        busy.current = false;
      }
    };

    // The switcher writes the new id before its own refresh, so by the time we
    // see a changed businessId prop it already matches — this only adopts the
    // value on a genuine first render.
    void reassert();

    const onVisible = () => { if (document.visibilityState === "visible") void reassert(); };
    window.addEventListener("focus", reassert);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", reassert);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [businessId, router]);

  return null;
}

/** Called by the switcher: this tab is deliberately changing business. */
export function rememberTabBusiness(businessId: string): void {
  try { sessionStorage.setItem(KEY, businessId); } catch { /* private mode */ }
}
