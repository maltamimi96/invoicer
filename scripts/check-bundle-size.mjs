#!/usr/bin/env node
/**
 * Bundle-size budget — the anti-bloat guard.
 *
 * Runs after `next build` in CI. Fails if the client JS grows past budget, so
 * a future PR can't quietly drag a heavy library into everyone's download.
 * Measures gzipped size (what users actually fetch) of the built client chunks.
 *
 * Budgets have headroom over today's numbers — they catch REGRESSIONS, not the
 * current state. Bump them deliberately (with a reason) when a real feature
 * genuinely needs the room.
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const CHUNKS_DIR = ".next/static/chunks";

// --- Budgets (gzipped) ---
const LARGEST_CHUNK_KB = 200;   // biggest single client chunk (today ~110 KB gz)
const TOTAL_KB = 3200;          // all client chunks combined (today ~2.1 MB gz)

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

let files;
try {
  files = walk(CHUNKS_DIR);
} catch {
  console.error(`✗ ${CHUNKS_DIR} not found — run \`npm run build\` first.`);
  process.exit(1);
}

const sized = files
  .map((f) => ({ f, gz: gzipSync(readFileSync(f)).length }))
  .sort((a, b) => b.gz - a.gz);

const totalGz = sized.reduce((n, x) => n + x.gz, 0);
const largest = sized[0] ?? { f: "(none)", gz: 0 };
const kb = (b) => (b / 1024).toFixed(1);

console.log("Client bundle (gzipped):");
console.log(`  chunks:        ${sized.length}`);
console.log(`  total:         ${kb(totalGz)} KB   (budget ${TOTAL_KB} KB)`);
console.log(`  largest chunk: ${kb(largest.gz)} KB   (budget ${LARGEST_CHUNK_KB} KB)  ${largest.f.replace(CHUNKS_DIR + "/", "")}`);
console.log("  top 5:");
for (const x of sized.slice(0, 5)) console.log(`    ${kb(x.gz).padStart(7)} KB  ${x.f.replace(CHUNKS_DIR + "/", "")}`);

const problems = [];
if (largest.gz / 1024 > LARGEST_CHUNK_KB) problems.push(`largest chunk ${kb(largest.gz)} KB > ${LARGEST_CHUNK_KB} KB budget`);
if (totalGz / 1024 > TOTAL_KB) problems.push(`total ${kb(totalGz)} KB > ${TOTAL_KB} KB budget`);

if (problems.length) {
  console.error("\n✗ Bundle budget exceeded:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nIf this growth is intentional and necessary, raise the budget in scripts/check-bundle-size.mjs with a note explaining why.");
  process.exit(1);
}
console.log("\n✓ Within bundle budget.");
