/**
 * The active-business cookies.
 *
 * Two cookies, one value:
 *
 * - `active_business_id` — httpOnly, the one the server trusts.
 * - `active_business_hint` — readable by JS, a mirror.
 *
 * The mirror exists so a browser tab can tell that ANOTHER tab changed the
 * active business. It can't read the httpOnly one, and without that knowledge
 * a tab happily keeps displaying business A while its next write lands on
 * business B. The hint carries no authority: every server path still reads the
 * httpOnly cookie, and RLS is still the gate. It leaks nothing — it's the id of
 * a business the user is already looking at.
 *
 * Plain module: imported by server actions, route handlers and the client
 * guard, so keep it free of "use server".
 */
import type { cookies } from "next/headers";

export const BIZ_COOKIE = "active_business_id";
export const BIZ_HINT_COOKIE = "active_business_hint";

const YEAR = 60 * 60 * 24 * 365;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/** Set both cookies together. Setting one without the other is the bug this
 *  helper exists to prevent — a stale hint makes tabs fight forever. */
export function setActiveBusinessCookies(store: CookieStore, businessId: string): void {
  store.set(BIZ_COOKIE, businessId, {
    path: "/", httpOnly: true, sameSite: "lax", maxAge: YEAR,
  });
  store.set(BIZ_HINT_COOKIE, businessId, {
    path: "/", httpOnly: false, sameSite: "lax", maxAge: YEAR,
  });
}

/** Read the hint in the browser. Returns null when absent. */
export function readBusinessHint(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${BIZ_HINT_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
