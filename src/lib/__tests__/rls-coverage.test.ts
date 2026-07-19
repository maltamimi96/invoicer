import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural guard: every business-scoped table must have RLS enabled.
 *
 * Three tables (sms_conversations, sms_messages, report_sessions) shipped with
 * no RLS at all and sat that way for months — readable cross-tenant with the
 * anon key, and two of them streaming over Realtime. Nothing caught it, because
 * nothing was looking.
 *
 * This parses the migration SQL rather than querying a database, so it runs in
 * CI with no credentials. It is deliberately dumb: any CREATE TABLE with a
 * business_id column must be followed somewhere by ENABLE ROW LEVEL SECURITY.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function allSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");
}

/** Tables created with a business_id column. */
function businessScopedTables(sql: string): string[] {
  const found = new Set<string>();
  // CREATE TABLE [IF NOT EXISTS] [public.]name ( ...body... )
  const re = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const name = m[1];
    // Walk to the matching close paren so we only read this table's body.
    let depth = 0, i = re.lastIndex - 1;
    for (; i < sql.length; i++) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")") { depth--; if (depth === 0) break; }
    }
    const body = sql.slice(re.lastIndex, i);
    if (/\bbusiness_id\b/.test(body)) found.add(name);
  }
  return [...found].sort();
}

/**
 * Tables with RLS switched on.
 *
 * Two forms in this repo, and missing the second produces false positives:
 *   1. literal   — ALTER TABLE public.foo ENABLE ROW LEVEL SECURITY;
 *   2. generated — a DO $$ block looping over an array of table names and
 *                  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL
 *                  SECURITY', t). Used by the booking, prospects and SEO
 *                  foundation migrations.
 *
 * For form 2 the table names are not statically known, so we collect every
 * quoted identifier inside a DO block that performs the ENABLE, and treat those
 * as covered. Slightly over-permissive, which is the right direction: this test
 * exists to catch a table nobody protected at all, not to police style.
 */
function rlsEnabledTables(sql: string): Set<string> {
  const s = new Set<string>();

  const literal = /ALTER TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+ENABLE ROW LEVEL SECURITY/gi;
  let m: RegExpExecArray | null;
  while ((m = literal.exec(sql))) s.add(m[1]);

  // DO $$ ... $$; blocks that enable RLS dynamically.
  const doBlocks = sql.match(/DO\s*\$\$[\s\S]*?\$\$\s*;/gi) ?? [];
  for (const block of doBlocks) {
    if (!/ENABLE ROW LEVEL SECURITY/i.test(block)) continue;
    for (const q of block.match(/'([a-z0-9_]+)'/gi) ?? []) {
      s.add(q.slice(1, -1).toLowerCase());
    }
  }

  return s;
}

describe("RLS coverage", () => {
  const sql = allSql();
  const scoped = businessScopedTables(sql);
  const enabled = rlsEnabledTables(sql);

  it("finds business-scoped tables to check", () => {
    // Sanity: if the parser breaks, the test must fail loudly rather than pass
    // by checking nothing.
    expect(scoped.length).toBeGreaterThan(20);
  });

  it("enables RLS on every table carrying a business_id", () => {
    const missing = scoped.filter((t) => !enabled.has(t));
    expect(
      missing,
      `These tables have a business_id but never get ENABLE ROW LEVEL SECURITY.\n` +
        `Every business-scoped table needs it — RLS is the only security gate for\n` +
        `normal requests. Add it in a migration.\n\n  ${missing.join("\n  ")}\n`
    ).toEqual([]);
  });
});
