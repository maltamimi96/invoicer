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
});
