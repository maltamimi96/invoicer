import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A "use server" file may only export async functions.
 *
 * Next.js enforces this at RUNTIME, not at build — so `tsc` passes, `next
 * build` passes, CI goes green, and the first request to any page importing
 * that file dies with "A 'use server' file can only export async functions,
 * found number". One stray `export const` breaks EVERY export in the file.
 *
 * This has now shipped to production twice (a const in actions/stripe.ts, and
 * MAX_ATTACHMENT_BYTES in actions/attachments.ts). Nothing else catches it, so
 * this test does.
 *
 * Constants belong in a plain sibling module — see src/lib/uploads.ts.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

/** Exports that are legal in a "use server" file. */
const OK = [
  /^export\s+async\s+function\s/,   // the only real export form
  /^export\s+type\s/,               // erased at compile time
  /^export\s+interface\s/,          // erased at compile time
  /^export\s*\{[^}]*\}\s*from\s+["'].*["'];?$/,   // re-export (values must be async fns)
];

describe("\"use server\" files", () => {
  const files = walk("src").filter((f) => {
    const head = readFileSync(f, "utf8").slice(0, 200);
    return /^\s*["']use server["']/.test(head);
  });

  it("finds the server-action files to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("export only async functions and types", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!/^export\s/.test(line)) return;
        if (OK.some((rx) => rx.test(line.trim()))) return;
        offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }
    expect(offenders, `Move these to a plain module — a non-async export breaks every export in the file at runtime:\n${offenders.join("\n")}`)
      .toEqual([]);
  });

  it("never RE-exports a type with `export type { X }`", () => {
    // Inline `export type X = …` and `export interface X` are fine: TypeScript
    // erases them. A re-export STATEMENT is not — Next's server-actions
    // transform enumerates every export and emits a runtime binding for it,
    // then fails the build with "Export X doesn't exist in target module".
    //
    // This broke the build once already. Importers should take the type from
    // the module that defines it.
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        const t = line.trim();
        if (/^export\s+type\s*\{/.test(t) || /^export\s*\{\s*type\s/.test(t)) {
          offenders.push(`${file}:${i + 1}  ${t.slice(0, 90)}`);
        }
      });
    }
    expect(
      offenders,
      `Import the type from where it's defined — a type re-export in a "use server" file fails the build:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
