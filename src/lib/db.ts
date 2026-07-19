/**
 * Unwrap a PostgREST result, throwing instead of silently returning nothing.
 *
 * The house trap (CLAUDE.md "Known traps"): callers destructure `{ data }` and
 * ignore `{ error }`, so a failed query is indistinguishable from an empty
 * table. The UI then renders its empty state — "No customers yet", "$0 revenue"
 * — and the user believes it.
 *
 * That is not a cosmetic bug. The rational response to a fabricated empty state
 * is to re-enter the data, which is exactly how PR #398's duplicate customer
 * was created: a search 400'd on a name containing a comma, the caller ignored
 * the error, the agent saw "no results" and made a second customer.
 *
 * Reserve empty states for genuinely empty. Everything else is an error and
 * should say so.
 *
 * Usage:
 *   const rows = unwrap(await sb.from("invoices").select("*"), "invoices");
 */
export function unwrap<T>(
  res: { data: T | null; error: { message: string; code?: string } | null },
  what: string,
): T {
  if (res.error) {
    throw new Error(`Couldn't load ${what}: ${res.error.message}`);
  }
  return res.data as T;
}

/**
 * Same, but for reads where "no rows" is legitimately fine — returns [] rather
 * than null so callers can drop their `?? []`, while a real error still throws.
 */
export function unwrapRows<T>(
  res: { data: T[] | null; error: { message: string; code?: string } | null },
  what: string,
): T[] {
  if (res.error) {
    throw new Error(`Couldn't load ${what}: ${res.error.message}`);
  }
  return res.data ?? [];
}

/**
 * Assert a write succeeded.
 *
 * Several actions fired an insert/update/delete without destructuring at all
 * (`await sb.from(...).insert(...)`), so a rejected write — an RLS denial, a
 * CHECK violation, a bad date — returned normally and the UI reported success.
 * The user is then told their payment was recorded when nothing was written.
 */
export function assertOk(
  res: { error: { message: string; code?: string } | null },
  what: string,
): void {
  if (res.error) {
    throw new Error(`Couldn't ${what}: ${res.error.message}`);
  }
}
