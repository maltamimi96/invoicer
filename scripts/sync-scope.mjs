#!/usr/bin/env node
// Sync SCOPE.md <-> GitHub Issues + Project v2 board.
// - Parses SCOPE.md for `- [ ]` / `- [x]` items under sections 1.x/2.x/3.x/4.
// - Creates one issue per unchecked item (idempotent: matches by exact title).
// - Adds new issues to the Invoicer Scope project, sets Status (P0 -> Up Next, else Backlog).
// - Closes issues whose SCOPE.md item is now ticked.
//
// Env: DRY_RUN=1 to preview only.
// Usage: node scripts/sync-scope.mjs

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = "maltamimi96/invoicer";
const PROJECT_OWNER = "maltamimi96";
const PROJECT_NUMBER = 1;
const PROJECT_ID = "PVT_kwHOAsy6Ns4BVd3v";
const STATUS_FIELD_ID = "PVTSSF_lAHOAsy6Ns4BVd3vzhQ5fVE";
const STATUS_OPTIONS = {
  Backlog: "bfe320b6",
  "Up Next": "82173192",
  "In Progress": "a8ac4a2d",
  "In Review": "5146fa97",
  Done: "6881f257",
};

const DRY = process.env.DRY_RUN === "1";
const here = dirname(fileURLToPath(import.meta.url));
const SCOPE_PATH = join(here, "..", "SCOPE.md");
const BODY_TMP = join(here, ".issue-body.tmp");

const SECTION_MAP = {
  "1.1": ["servicem8", "jobs"],
  "1.2": ["servicem8", "scheduling"],
  "1.3": ["servicem8", "tech-pwa"],
  "1.4": ["servicem8", "inventory"],
  "1.5": ["servicem8", "assets"],
  "1.6": ["servicem8", "online-booking"],
  "1.7": ["servicem8", "payments"],
  "1.8": ["servicem8", "quotes-flow"],
  "2.1": ["ghl", "crm"],
  "2.2": ["ghl", "inbox"],
  "2.3": ["ghl", "workflows"],
  "2.4": ["ghl", "email-marketing"],
  "2.5": ["ghl", "calendars"],
  "2.6": ["ghl", "forms"],
  "2.7": ["ghl", "funnels"],
  "2.8": ["ghl", "reputation"],
  "2.9": ["ghl", "chat-widget"],
  "2.10": ["ghl", "memberships"],
  "2.11": ["ghl", "call-tracking"],
  "2.12": ["ghl", "ad-attribution"],
  "3.1": ["platform", "ai-agents"],
  "3.2": ["platform", "reporting"],
  "3.3": ["platform", "notifications"],
  "3.4": ["platform", "rbac"],
  "3.5": ["platform", "integrations"],
  "3.6": ["platform", "public-api"],
  "3.7": ["platform", "saas-billing"],
  "3.8": ["platform", "onboarding"],
  "3.9": ["platform", "import-export"],
  "4": ["guardrails", "guardrails"],
};

function sh(cmd, { retries = 4 } = {}) {
  if (DRY) { console.log("[dry] " + cmd); return ""; }
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    } catch (e) {
      lastErr = e;
      const wait = 1500 * Math.pow(2, i);
      console.error(`  retry ${i + 1}/${retries} in ${wait}ms: ${(e.stderr || e.message || "").toString().slice(0, 200)}`);
      const end = Date.now() + wait;
      while (Date.now() < end) {}
    }
  }
  throw lastErr;
}

function shSoft(cmd) {
  try { return sh(cmd); } catch (e) { console.error("  SKIP after retries:", (e.stderr || e.message || "").toString().slice(0, 200)); return null; }
}

function parseScope(md) {
  const items = [];
  let section = null;
  let sectionTitle = null;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+([0-9]+(?:\.[0-9]+)?)\s+(.+)$/);
    if (h) { section = h[1]; sectionTitle = h[2].trim(); continue; }
    if (/^#\s+Part\s+4/.test(line)) { section = "4"; sectionTitle = "Quality & Ops Guardrails"; continue; }
    const m = line.match(/^- \[( |x)\] \*\*(P[012])\*\*\s+(.+)$/);
    if (m && section) {
      items.push({
        done: m[1] === "x",
        priority: m[2].toLowerCase(),
        text: m[3].replace(/\*\*/g, "").trim(),
        section,
        sectionTitle,
      });
    }
  }
  return items;
}

const labelsFor = (item) => {
  const [scope, cap] = SECTION_MAP[item.section] ?? ["platform", "guardrails"];
  return [`scope:${scope}`, `priority:${item.priority}`, `cap:${cap}`];
};

const titleFor = (item) => {
  const [, cap] = SECTION_MAP[item.section] ?? [];
  const first = item.text.split(/[:.]/)[0].trim();
  return `[${cap}] ${first}`.slice(0, 240);
};

const bodyFor = (item) => {
  const [scope, cap] = SECTION_MAP[item.section] ?? [];
  return [
    `**Spec source:** SCOPE.md § ${item.section} — ${item.sectionTitle ?? ""}`.trim(),
    "",
    `- **Scope:** ${scope}`,
    `- **Capability:** ${cap}`,
    `- **Priority:** ${item.priority.toUpperCase()}`,
    "",
    `### What to build`,
    "",
    item.text,
    "",
    `### Definition of done`,
    "",
    `- Implementation matches the spec in SCOPE.md § ${item.section}.`,
    `- Server actions registered as AI tools with Zod schemas (voice-first rule).`,
    `- Multi-business scoping + RLS verified.`,
    `- New tables use RLS: \`business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())\`.`,
    `- Tick the checkbox in SCOPE.md and append the file/route pointer.`,
  ].join("\n");
};

function listIssues() {
  const out = execSync(`gh issue list --repo ${REPO} --state all --limit 1000 --json number,title,state`, { encoding: "utf8" });
  return JSON.parse(out || "[]");
}

async function main() {
  const md = readFileSync(SCOPE_PATH, "utf8");
  const items = parseScope(md);
  console.log(`Parsed ${items.length} items (${items.filter(i => !i.done).length} open, ${items.filter(i => i.done).length} done).`);

  const existing = listIssues();
  const byTitle = new Map(existing.map((i) => [i.title, i]));

  let created = 0, skipped = 0, closed = 0, proj = 0;

  for (const item of items) {
    const title = titleFor(item);
    const found = byTitle.get(title);

    if (item.done) {
      if (found && found.state === "OPEN") {
        console.log(`close  #${found.number}  ${title}`);
        if (!DRY) sh(`gh issue close ${found.number} --repo ${REPO} --reason completed`);
        closed++;
      }
      continue;
    }

    if (found) { skipped++; continue; }

    if (!DRY) writeFileSync(BODY_TMP, bodyFor(item));
    const labels = labelsFor(item).map(l => `--label "${l}"`).join(" ");
    const titleEsc = title.replace(/"/g, '\\"');
    const out = shSoft(`gh issue create --repo ${REPO} --title "${titleEsc}" --body-file "${BODY_TMP}" ${labels}`);
    if (!out) continue;
    const url = (out.match(/https:\/\/github\.com\/\S+\/issues\/\d+/) || [])[0];
    console.log(`create ${url || "(dry)"}  ${title}`);
    created++;

    if (url) {
      const addOut = shSoft(`gh project item-add ${PROJECT_NUMBER} --owner ${PROJECT_OWNER} --url "${url}" --format json`);
      if (!addOut) continue;
      try {
        const itemId = JSON.parse(addOut).id;
        const status = item.priority === "p0" ? "Up Next" : "Backlog";
        shSoft(`gh project item-edit --id ${itemId} --project-id ${PROJECT_ID} --field-id ${STATUS_FIELD_ID} --single-select-option-id ${STATUS_OPTIONS[status]}`);
        proj++;
      } catch (e) { console.error("project add failed:", e.message); }
    }
  }

  try { unlinkSync(BODY_TMP); } catch {}
  console.log(`\ncreated=${created} skipped=${skipped} closed=${closed} project+=${proj}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
