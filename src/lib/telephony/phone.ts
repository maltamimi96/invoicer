/**
 * Phone-number normalisation for caller-ID matching.
 *
 * Caller ID arrives in whatever shape the carrier feels like — +61412345678,
 * 0412345678, 61412345678, "(02) 9876 5432" — while the number stored against
 * a customer is whatever someone typed into a form. Comparing the LAST 9
 * DIGITS collapses all of those to the same key, because 9 digits is the
 * Australian national significant number: the part after the country code or
 * the trunk 0.
 *
 *   +61 412 345 678  → 412345678
 *   0412 345 678     → 412345678
 *   (02) 9876 5432   → 298765432
 *
 * The same expression is a STORED generated column (`phone_digits`) on
 * customers / contacts / leads / prospects, so matching is an indexed equality
 * lookup rather than a wildcard scan. Keep the two in step: if you change the
 * rule here, change migration 20260804090000 too.
 *
 * Plain module — no server-only imports, so the UI can normalise for display.
 */

/** Digits only, no formatting. */
export function digitsOf(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/**
 * The match key: last 9 digits, or "" when there aren't enough to be a real
 * number. Short internal extensions (3-4 digits) deliberately return "" —
 * matching on them would collide across unrelated records.
 */
export function matchKey(raw: string | null | undefined): string {
  const d = digitsOf(raw);
  if (d.length < 6) return "";
  return d.slice(-9);
}

/** Pretty AU formatting for display; falls back to the input if unrecognised. */
export function formatAuPhone(raw: string | null | undefined): string {
  const d = digitsOf(raw);
  const nsn = d.length >= 9 ? d.slice(-9) : d;
  if (nsn.length !== 9) return String(raw ?? "");
  // Mobiles start 4; landlines are area code + 8 digits.
  return nsn.startsWith("4")
    ? `0${nsn.slice(0, 3)} ${nsn.slice(3, 6)} ${nsn.slice(6)}`
    : `(0${nsn.slice(0, 1)}) ${nsn.slice(1, 5)} ${nsn.slice(5)}`;
}

/** True when two numbers are the same line, whatever format each is in. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = matchKey(a);
  return ka !== "" && ka === matchKey(b);
}
