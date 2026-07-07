# SEO Agency Platform — Kirei-scoped build plan

**Status:** approved direction, not yet started · **Owner doc** for the "plugins + SEO agency vertical" initiative (July 2026).
**Decisions locked:** built **inside Kirei as plugins** (not a separate app + SSO) · **Local-service playbook first**, Shopify second · industry presets are a core requirement.

The source vision is the "SEO Agency Platform — Build Plan" (agency operating layer / vertical playbooks / agent engine / connectors). This doc maps it onto Kirei's actual codebase: what's reused, what's new, and in what order. Guiding fact: **Kirei already IS the agency CRM layer** — clients, contracts + e-sign, recurring retainer billing, Stripe, client portal, onboarding forms (with encrypted credentials), public lead-capture forms, tasks kanban, per-business branded email, PDF pipeline. We are adding **the plugin foundation, the SEO production engine, and reporting** on top.

---

## Phase 0 — Plugin system foundation (~1–1.5 wks)

Generalize the existing informal plugin pattern (`business_agent_installs` + `agents-catalog.ts` + `syncSideEffects` + feature flags in `(dashboard)/layout.tsx`) into a first-class module system. Everything later lands as plugins on this.

**0.1 Registry** — `src/lib/plugins/registry.ts`:

```ts
interface PluginDefinition {
  id: string;                    // "invoicing", "jobs", "forms", "seo-production"…
  name: string; description: string; icon: string;
  category: "core" | "sales" | "service" | "marketing" | "automation" | "seo";
  core?: boolean;                // core plugins can't be disabled
  dependencies?: string[];       // e.g. recurring-billing → ["invoicing", "payments"]
  navItems: { label: string; href: string; section: string }[];
  routePrefixes: string[];       // for route-level gating
  settingsSideEffect?: string;   // settings table to sync (existing pattern)
}
```

Wrap every major module as a plugin: Quotes, Invoicing, Recurring billing, Jobs/Work Orders, Scheduling+Dispatch, Booking, Site Reports, Contracts, Onboarding forms, Form Builder, Quoting Agent, Messages, Products, Analytics, + the existing automation agents. **Core (not disableable):** Dashboard, Customers/Contacts, Tasks, Team, Settings, AI Assistant.

**0.2 State** — keep `business_agent_installs` as the state table (rename in UI only; add a view/alias later if it grates). Enabled-set resolver: one query in `(dashboard)/layout.tsx` replacing the per-feature lookups → `features: Record<pluginId, boolean>`; disabled-by-default for optional plugins, with a migration that backfills installs for every existing business so **nothing disappears for current users** (grandfather: enable all currently-visible modules).

**0.3 Three-layer gating**
1. **Nav** — sidebar items come from the registry, filtered by enabled set (replaces hand-coded `feature:` flags).
2. **Route** — `(dashboard)/layout.tsx` already receives `x-pathname` (proxy forwards it); check it against `routePrefixes` of disabled plugins → `redirect("/dashboard")`. This closes the "reachable by URL" hole.
3. **MCP/actions (light)** — `assertPluginEnabled(ctx, pluginId)` helper for MCP tools of optional plugins (best-effort; not a security boundary — RLS remains that).

**0.4 Industry presets** — `src/lib/plugins/presets.ts`:

```ts
interface IndustryPreset {
  id: string;                 // "trades", "agency", "seo-agency-local", "cleaning"…
  label: string;
  plugins: string[];          // enabled bundle
  vocab?: Record<string, string>;   // term overrides (see 0.5)
}
```

`businesses.industry_preset` column (nullable). Signup wizard (`/onboarding`) gains a "What kind of business are you?" step → applies the preset (installs plugin rows). Changeable later in Settings → Plugins ("apply preset" + individual toggles). `/agents` page becomes **"Plugins"** (route can stay `/agents` initially to avoid churn; label + copy change).

**0.5 Vocabulary layer (v1 = minimal)** — `vocab(businessOrPreset, "work_order") → "Project"`. v1 scope: **sidebar labels + page titles only** (the registry's navItems read through vocab). Full string sweep across detail pages is deliberately deferred — it's the one piece with big surface area. Terms in v1: work order/job → project, site → —, worker/crew → team member, customer → client.

**Ships as 2 PRs:** (registry + gating + grandfather migration) then (presets + signup step + Plugins rebrand). Standing rules apply throughout: MCP tools for toggling/listing plugins & presets, migrations applied + recorded, CI gate.

---

## Phase 1 — "Agency" preset with existing modules (~2–4 days)

Zero new SEO code; proves the multi-vertical thesis on Connected Studio.

- Preset `agency`: **on** = Leads, Forms, Onboarding, Contracts, Quotes ("Proposals" via vocab), Invoicing, Recurring billing, Payments, Tasks, Messages, Analytics. **off** = Scheduling/Dispatch, Booking, Site Reports, Products, Jobs (or on with "Projects" vocab — Connected Studio's call).
- Apply to Connected Studio; Crown Roofers gets `trades` (everything as today).
- **Milestone:** two live businesses with visibly different apps from one codebase.

---

## Phase 2 — SEO production engine (Local playbook) (~3–4 wks) — the big one

The genuinely new build: background agent jobs + first connector + SEO data model. All behind a new **"SEO Production"** plugin (category `seo`), only in the `seo-agency-local` preset by default.

**2.1 Data model** (one migration; entities hang off `(business_id, customer_id)` — the agency is the business, their client is the customer):
- `seo_sites` — client site (customer_id, domain, platform wordpress/shopify/other, playbook local/ecommerce)
- `seo_connections` — per-site connector auth (provider `gsc`/`shopify`/`wordpress`/`gbp`, **tokens AES-256-GCM encrypted** — generalize `src/lib/onboarding/crypto.ts` → `src/lib/crypto.ts`, same env-key pattern)
- `seo_keyword_snapshots` — time-series (site, keyword, position, clicks, impressions, captured_at)
- `seo_opportunities` — the scout's queue (site, type, title, detail, priority, status)
- `seo_content_pieces` — brief → draft → approved → published lifecycle (+ target keyword, html, published_url)
- `seo_jobs` — the job engine (see 2.3)
- `seo_brand_profiles` — voice/tone per client (seed from customer + onboarding-form answers)

**2.2 GSC connector** — Google OAuth per client site (readonly Search Console scope). Store refresh token encrypted; nightly cron pulls query/position data into `seo_keyword_snapshots`.
⚠️ **External dependency (user):** create the Google Cloud OAuth client; Search Console scope requires app verification for production use (use test-user mode during dev). This is the only Phase-2 item Claude can't do alone.

**2.3 Job engine (Vercel-native, no new infra)** — `seo_jobs(id, business_id, site_id, type, status queued|running|awaiting_approval|done|failed, step, checkpoint jsonb, input, output, cost_cents, error)`. Runner = `/api/cron/seo-jobs` (every minute): claims one job, executes **one step** (each step < ~250s, fits Vercel), checkpoints, re-queues. Human gates = `awaiting_approval` + an Approve button. Agents (keyword-strategist, opportunity-scout, brief-architect, copywriter, humanizer, on-page-optimizer, editor…) are **step definitions calling the Claude API** — same pattern as the quoting agent but batch/server-side. Model policy: `claude-sonnet-5` default, opus-class only for strategy steps. **Per-business monthly `cost_cents` budget cap enforced by the runner** (non-negotiable per source plan §11). Upgrade path if the polling runner chafes: Vercel Queues / Inngest — not v1.
Publishing v1: **WordPress REST connector + copy/export**; auto-publish elsewhere later.

**2.4 Surfaces** — `/seo` (client sites overview: health, connector status, work due), `/seo/[siteId]` (opportunities queue, content pipeline with approval gate, keyword trends), all portal-visible pieces reuse the existing customer portal. MCP: `list_seo_sites`, `connect_site`, `run_seo_job`, `approve_content`, `list_opportunities`, etc.

**Milestone (the "smallest shippable" from the source plan):** one real local client — GSC connected → opportunity queue populated → one content piece drafted by agents, approved, published → keyword movement visible.

---

## Phase 3 — White-label client reporting (~1 wk)

`seo_reports` (site, period, metrics jsonb, work_log jsonb, pdf_path) + `report-builder` job type: assembles monthly report (rankings movement from snapshots, traffic, work delivered from content_pieces/tasks, next-month plan from strategist) → **react-pdf** branded to the agency (existing PDF + pdf_settings pipeline) → emailed via existing per-business sender + visible at a **new portal route** `/portal/[token]/seo-report/[id]` (NB: "Site Reports" already means inspection reports — keep the entity/routes distinct, vocab handles labels). Monthly cron auto-generates per active site; account manager approves before send (same gate pattern).

---

## Phase 4 — Instant-audit sales engine (~1 wk)

Public lead magnet: prospect enters URL (+email) → audit job runs (crawl-lite + GSC-less checks) → branded PDF report emailed + **lead auto-created** (reuses Form Builder submit path + `upsert_lead` source `seo-audit`) + optional proposal draft via contracts/quotes. Surface: a Form Builder **field preset/template** ("SEO audit request") + a dedicated `/audit/[slug]` public page variant. This is the acquisition loop closing: audit → lead → proposal (contract) → retainer (recurring invoice) — all existing Kirei machinery.

---

## Phase 5 — Shopify / e-commerce playbook (~3–4 wks, second act)

New preset `seo-agency-ecommerce` + "Shopify SEO" plugin: Shopify Admin API connector (per-store OAuth), catalog ingest (`seo_products`, `seo_collections`, `seo_catalog_snapshots` time-series), batch optimizers (titles/meta/descriptions/alt text/schema), **write-back with mandatory dry-run preview → batch approval → `seo_optimization_changes` log with before/after → one-click rollback** (hard requirement; never silent bulk writes), analytics-driven prioritization (optimize the revenue SKUs first). E-commerce agents: technical-auditor, product-page-optimizer, collection-strategist, catalog-keyword-mapper.

## Phase 6 — Scale (later)

GA4 + DataForSEO/Ahrefs connectors (competitive niches will demand paid data), competitor-tracker agent, more presets (SaaS/B2B, professional services), and the **monetization tie-in**: plugin tiers become plan tiers (Free = core; Pro = automation/forms; SEO = vertical pricing) — this plugin system is the substrate for the subscription-billing layer already identified as Kirei's biggest SaaS gap.

---

## Risks / hard calls (inherited + Kirei-specific)

| Risk | Mitigation |
|---|---|
| Migrations still hit the **live** Supabase project | Phase 2 adds ~7 tables — additive only, but this is the moment to stand up the staging DB (Supabase branching or `supabase start`) per CLAUDE.md's standing note |
| LLM cost at agency scale | per-business `cost_cents` caps, sonnet-default, "only run what changed", cache briefs |
| Vercel function limits vs long agent runs | step-wise jobs with checkpointing (design above), never one giant invocation |
| GSC OAuth verification friction | test-user mode during build; user starts Google verification early (weeks of lead time) |
| Shopify write-back danger | dry-run + approval + change-log + rollback, enforced in schema not convention |
| Bulk copy quality at scale | editorial gate + brand voice + dedup are mandatory steps, not optional |
| Vocab sweep scope creep | v1 = nav + titles only; full relabel is its own later effort |
| Mobile parity | SEO plugins are **web-only v1** (explicit exception recorded in `docs/MOBILE_PARITY_PLAN.md` when Phase 2 lands) |

## Needed from the user (by phase)

- **P0:** confirm core-plugin set + "Plugins" naming; pick preset list for launch (trades / agency / seo-agency-local).
- **P2:** Google Cloud OAuth client (GSC readonly scope) + start verification; confirm Anthropic API key/budget for agent runs; first guinea-pig client (Crown Roofers or Prestons per source plan).
- **P5:** Shopify Partner app credentials.

## Sequencing summary

`P0 plugins+presets (1–1.5wk)` → `P1 agency preset live (days)` → `P2 SEO engine + local playbook (3–4wk)` → `P3 reporting (1wk)` → `P4 instant-audit (1wk)` → `P5 Shopify (3–4wk)` → `P6 scale`. Each phase ships independently through the CI gate; nothing later blocks on everything earlier being perfect. If the growth thesis flips to e-commerce, P5 swaps with P3/P4 — the foundation (P0–P2) is identical either way.
