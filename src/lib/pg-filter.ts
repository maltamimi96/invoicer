/**
 * Helpers for building PostgREST filter strings safely.
 *
 * Plain module — safe to import from client and server.
 */

/**
 * Build a PostgREST `.or()` filter matching `term` as a case-insensitive
 * substring across `columns`.
 *
 * The value MUST be quoted. PostgREST parses `or=(a.ilike.X,b.ilike.Y)` using
 * commas to separate conditions and dots to separate column/operator/value, so
 * interpolating a raw term breaks the grammar the moment it contains one of
 * those characters — and `Smith, John` is an ordinary customer name, not an
 * attack. The result was a 400 that callers silently swallowed as "no matches",
 * which is how duplicate customers got created.
 *
 * Double-quoting makes reserved characters literal; inside the quotes only `"`
 * and `\` carry meaning, so those are the only two that need escaping. The `%`
 * wildcards sit outside PostgREST's concern — they're passed through to ilike.
 */
export function ilikeAcross(columns: string[], term: string): string {
  const escaped = term.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return columns.map((c) => `${c}.ilike."%${escaped}%"`).join(",");
}
