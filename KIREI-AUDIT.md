# Kirei — Commercial Readiness Report

## 1. Verdict

You have built roughly three products and finished none of them commercially. The one that matters — field services — has a real, dependent user (a roofer with $17k outstanding, $327k open quotes, 98 jobs) and is genuinely competitive on features. But you cannot charge anyone for Kirei (no subscription billing exists anywhere in the codebase), your AI differentiator returns 401 in production, and the audit found a live cross-tenant data leak: `sms_conversations`, `sms_messages` and `report_sessions` have **no RLS at all** and the SMS tables are published to Realtime, so any authenticated user of any tenant can read every business's customer phone numbers and message bodies (`supabase/migrations/20260413000002_sms.sql:3-37`).

**The single most important thing to do next:** ship the RLS migration and fail-close the cron auth this week, then build subscription billing. Everything else — features, design, the SEO platform — is downstream of being able to take money safely.

---

## 2. Ship blockers

Ordered. These must be fixed before a stranger pays you.

### B1. Three tables have no RLS; SMS is streamed cross-tenant over Realtime
**Where:** `supabase/migrations/20260413000002_sms.sql:3-37` (creates `sms_conversations` + `sms_messages`, no `ENABLE ROW LEVEL SECURITY`, then `ALTER PUBLICATION supabase_realtime ADD TABLE` on both at lines 36-37); `supabase/migrations/20260413000003_report_sessions.sql:4-17`. No later migration adds policies. `src/components/messages/messages-client.tsx` subscribes to `sms-conversations` with event `*` and **no filter**.
**Why it blocks:** Signup is public. Any authenticated user reads every tenant's customer names, E.164 phone numbers and message text with the anon key, and Realtime pushes other tenants' rows into their browser live. `report_sessions` leaks customer ids and property addresses the same way. This is a reportable breach in most jurisdictions and an instant loss in any security review.
**Effort:** hours. One migration: enable RLS on all three, standard owner-UNION-active-member policy, `AND NOT public.is_business_worker(business_id)` on the SMS pair, deny-all on `report_sessions` (only written by the admin client). Add `filter: business_id=eq.<id>` to the Realtime channel.

### B2. Twelve cron routes fail OPEN — including the one that charges saved cards
**Where:** `src/app/api/cron/recurring-invoices/route.ts:22` — `if (process.env.CRON_SECRET && auth !== ...) return 401`. Same shape at `daily-digest:41`, `invoice-reminders:33`, `process-scheduled-sends:205`, `quote-followup:33`, `recurring-jobs:30`, `reminders:78`, `seo-audits:17`, `seo-gsc-sync:23`, `seo-jobs:20`, `seo-reports:16`, `workorder-complete:29`. `/api/cron/` is unconditionally public in `src/lib/supabase/middleware.ts:48,68`. Only `content-jobs/route.ts:27` and `email-leads/route.ts:396-398` fail closed.
**Why it blocks:** If the variable is ever unset, renamed or missing in an environment (preview environments point at the **production** database), an unauthenticated GET generates invoices and off-session charges customers' saved cards via `src/lib/recurring/generate-invoice.ts:77-80` — on a live Stripe integration, up to 6 catch-up cycles per schedule per call. `invoice-reminders` and `quote-followup` can be looped to spam every tenant's customers from a verified domain.
**Effort:** minutes. One `requireCron(req)` helper that 500s when the secret is unset and 401s on mismatch, used in all fourteen routes including `booking-reminders:19-20`. Then verify `CRON_SECRET` exists in *every* Vercel environment and redeploy (env changes don't apply to a running deployment).

### B3. There is no way to charge for Kirei
**Where:** Nowhere. No subscription, plan, trial or billing-period code exists in `src/lib/actions` or the settings pages. Stripe Connect lets *your customers* take money; there is no mechanism for *you* to be paid.
**Why it blocks:** Literally. You cannot sell the product today.
**Effort:** days. Stripe Billing (not Connect) on the platform account, a `plan`/`trial_ends_at` on `businesses`, a paywall gate in `(dashboard)/layout.tsx`, and a billing page. Keep it dumb: three prices, one webhook, no proration logic in v1.

### B4. `addPayment` discards the insert error — a failed payment reports success
**Where:** `src/lib/actions/invoices.ts:351` — bare `await tbl(supabase, "payments").insert({...})`, no destructure, no throw. Execution falls through to the recompute at `:357-372`, which re-reads the payments table and writes the pre-existing `amount_paid` back over itself. The updates at `:372` and `:417` are also unchecked. No validation of `payment.amount` anywhere in the function.
**Why it blocks:** On any insert failure (RLS denial, CHECK violation, bad date) the UI reports success and revalidates, and the user believes money was recorded when nothing was written. Same shape as the `.or()` incident in your own Known-traps list. Reachable by editor-role users and the MCP/assistant surface.
**Effort:** minutes. `const { error } = ...; if (error) throw error;` on all three writes, plus `if (!Number.isFinite(amount) || amount <= 0) throw`.

### B5. Marking an invoice paid, then recording a payment, silently un-pays it
**Where:** `src/lib/actions/invoices.ts:96-99` (updateInvoice sets `amount_paid = cur.total` on status→paid, writes no payments row) vs `:357-372` (addPayment recomputes `amount_paid` purely from the payments table and overwrites). The parent-rollup branch at `:409-415` correctly refuses to fight `cancelled`/`draft`; the invoice's own status write at `:370` has no such guard.
**Why it blocks:** Mark a $10,000 invoice paid from the dropdown, then record any later payment: `amount_paid` drops to that payment's value and status flips to `partial`. A settled invoice reads as outstanding on the dashboard and becomes a target for the overdue cron — which then emails the customer chasing money they already paid. Note the recompute itself is deliberate (it fixes progress-invoice rollup); preserve that behaviour.
**Effort:** hours. Make payments the single source of truth: have the mark-paid branch insert a balancing payments row ("Manual — marked paid") instead of writing the column directly.

### B6. Every business defaults to GBP; nothing checks it against the Stripe account
**Where:** `supabase/migrations/001_initial_schema.sql:20` — `currency text not null default 'GBP'`. Read at `src/app/api/stripe/checkout/route.ts:68` (line items `:83`, fee `:70`) and `src/lib/stripe-charge.ts:59`. `handleAccountUpdated` (`src/app/api/stripe/webhook/route.ts:54-64`) receives the Stripe Account and persists only `country` — never `default_currency`. Signup never sets currency; the only change path is `src/components/settings/settings-client.tsx:353-360`.
**Why it blocks:** Wrong default for an Australian product, and no guard anywhere against charging a currency the connected account doesn't settle in. The live payment path has never been exercised by a real customer, so the first one is the test.
**Effort:** hours. Persist `account.default_currency`, treat it as source of truth for charge currency, hard-refuse on mismatch in both charge paths, change the schema default, force the choice at signup.

### B7. `npm test` writes to the production database
**Where:** `src/lib/booking/__tests__/booking-db.test.ts:29` selects `businesses ... limit(1)` and inserts a `VITEST_TMP` booking resource into whichever tenant is first (`:31-33`), then 8 concurrent appointments (`:42-63`). Gate is just "env vars present" (`:17`); `setup.ts:2-4` loads `.env.local`, which holds production keys. Cleanup is `afterAll` only, so an interrupt orphans the rows. CI never runs it (no secrets), so it only ever runs against prod.
**Why it blocks:** A phantom resource and year-2099 appointments in a paying customer's UI. Also means the documented verification command is unsafe.
**Effort:** hours. Gate behind `RUN_DB_TESTS=1` (the pattern `src/lib/mcp/__tests__/live-api.test.ts:23` already uses), create a throwaway business in `beforeAll` rather than `limit(1)`, wrap cleanup in try/finally.

### B8. `ANTHROPIC_API_KEY` returns 401; `SENTRY_DSN` unset
**Why it blocks:** Every AI feature — the assistant, quoting agent, SEO pipeline, Content Studio — is dead in production. A prospect clicking "Assistant" in a trial sees an abandoned product, and the AI is your only defensible differentiator. Separately, `src/instrumentation.ts` is inert without a DSN, so with paying customers you learn about outages from angry phone calls.
**Effort:** minutes each. Top up the account, set the DSN.

### B9. Worker isolation stops at six tables
**Where:** `supabase/migrations/20260430000001_worker_role_and_isolation.sql` applies `is_business_worker` to exactly `customers:76`, `products:97`, `invoices:118`, `quotes:139`, `payments:160`, `reports:181`. Not applied to: `sites` (`20260418000001:51`), `contacts` (`20260428000002:71`, the live policy), `billing_profiles` (`20260418000001:148`), `leads` (`20260412000001:42`), `customer_notes` (`20260403000001:51`).
**Why it blocks:** A worker — the role you document as hard-isolated — can SELECT/INSERT/UPDATE/DELETE every serviced address, every contact, the entire sales pipeline and all customer notes, via the mobile Supabase client or raw PostgREST. Half the guarantee isn't real, and it's invisible from the UI. This is the hardest question in a prospect's security review.
**Effort:** hours. One migration replacing those five policies with `AND NOT public.is_business_worker(business_id)`.

### B10. OAuth consent mints a permanent admin-scope key for *any* member, including workers
**Where:** `src/app/api/oauth/authorize/route.ts` — `listBusinesses` filters on `user_id` + `status='active'` only; `role` is never read. `src/app/api/oauth/token/route.ts` inserts a `business_api_keys` row with `scopes: ["admin"]` and **no `expires_at`**. Contrast `src/lib/actions/api-keys.ts` (gates on `canManageSettings`) and `src/lib/assistant/scopes.ts` (returns `null` for worker precisely because the admin client bypasses RLS).
**Why it blocks:** A worker completing the claude.ai connector flow gets a never-expiring wildcard key with read/write on every customer, invoice, quote and payment through ~199 MCP tools. Insider-only, which is why it's below B1, but it's the exact escalation your scope layer exists to prevent.
**Effort:** hours. Join `role` in `listBusinesses` and drop worker/viewer; replace `["admin"]` with `assistantScopesForRole(role)`; set `expires_at`.

---

## 3. Polish customers will notice

Ordered by visible impact per hour.

| # | Fix | Where | Effort |
|---|---|---|---|
| P1 | **Six one-click deletes with no confirmation.** A misclick on a 16px trash icon — sitting next to the receipt-view icon — permanently destroys a financial record. `assets.ts:72-77` is a hard row delete. `leads-client.tsx:445-459` already has the AlertDialog pattern to copy. | `expenses-view.tsx:86-91,136`; `assets-view.tsx:57,107`; `seo-reports.tsx:40,87`; `seo-connections.tsx:92,297`; `content-brands-view.tsx:74,199`; `content-campaigns-view.tsx:149` | hours |
| P2 | **No `error.tsx` or `not-found.tsx` anywhere.** 89 pages, 47 `notFound()` call sites, zero boundaries. Every 404 and every server-component throw renders Next's bare black-and-white page with no sidebar and no way back — and with no Sentry you never learn it happened. | Add `(dashboard)/error.tsx`, `(dashboard)/not-found.tsx`, root `global-error.tsx` + `not-found.tsx`. Compose from PageHeader + EmptyState. | hours |
| P3 | **The overdue-payment email contains no way to pay.** `invoice-reminders/route.ts:99-126` builds inline HTML with zero links — no portal link, no pay link. The imported `btn` helper at `:14` is never used. Your highest-intent email offers the customer nothing to click. | `src/app/api/cron/invoice-reminders/route.ts` — reuse the token helper at `generate-invoice.ts:131-144` | hours |
| P4 | **Cron emails go out from Crown Roofers' address, for every tenant.** `reminders/route.ts:17` defaults to `Crown Roofers <noreply@crownroofers.com.au>` and `:176` hardcodes `replyTo: info@crownroofers.com.au`. `invoice-reminders:19`, `quote-followup:19`, `workorder-complete:19` use the global `RESEND_FROM_EMAIL` (production = the Crown Roofers address). None set replyTo, none call `getResolvedEmailTemplate` — so the per-business email templates you built in June are silently ignored on every one of these paths. `process-scheduled-sends:119,184` does it correctly; copy that. | 4 cron routes | hours |
| P5 | **`/api/cron/reminders` is hardcoded to one business UUID.** `route.ts:14` pins `BUSINESS_ID`, `:68` is the only `business_id` filter in the file, one Telegram chat at `:16`. Runs daily. Every other tenant silently gets nothing. | Fan out over `business_agent_installs` like `invoice-reminders:43-47`, or delete the route and its `vercel.json` entry | hours |
| P6 | **Plugin list pages have no search.** Zero search inputs in expenses, assets, inventory, timesheets, contracts. `CleanupButton` is imported in only 8 files against CLAUDE.md's claim that it's on "every list page". A prospect comparing to ServiceM8 will try to search the first list they open. | Port the `leads-client.tsx:308-317` pattern | days |
| P7 | **In-app help covers 14 of 32 modules and never mentions payments.** `help-client.tsx:16-130` has no section on Stripe, card payments, deposits, saved cards, contracts, e-signature, forms or bookings. A customer cannot discover from inside the product that Kirei takes card payments — plausibly a contributing cause of zero payments ever. | `src/components/help/help-client.tsx` — lead with "Getting paid" | days |
| P8 | **PageHeader truncates the title on every page**, against your own documented break-words rule. `page-header.tsx:30`, one-word fix. | `truncate` → `break-words` | minutes |
| P9 | **Refunds, disputes and failed bank payments are unhandled.** The webhook switch (`webhook/route.ts:31-45`) covers 4 events; no reversal logic exists anywhere in `src/`. A refund leaves the invoice reading paid and still counting as revenue. Not yet damaging (0 payments), but it's the second real customer interaction that breaks it. | `charge.refunded`, `charge.dispute.created`, `checkout.session.async_payment_failed` | days |
| P10 | **`.ch-table` rows show a pointer cursor and hover highlight but aren't clickable** (`globals.css:446-450`; rows in inventory/assets/expenses/timesheets have no onClick). One-line CSS: move to an opt-in `.ch-table.is-clickable`. | `globals.css` | minutes |

---

## 4. Design direction

The token layer in `globals.css:134-179` is genuinely good — warm off-white canvas, deep teal, the tracking corrections at `:118-125` show real craft. And `lead-card.tsx:3-11` contains a written design rationale ("the old card filled its whole surface with one of five stage colours… a full board was five columns of saturated blocks and nothing stood out") that arrives at exactly the right answer. **The work is not new design. It is applying that one paragraph of reasoning to the other twenty screens.**

**Two are outright bugs, not taste:**

1. **`.ch-pill` has no dark-mode variant.** Backgrounds are hardcoded literals (`hsl(150 50% 95%)` etc., `globals.css:474-493`) with no `.dark` override. In dark mode they render as near-white blocks — on `worker-dashboard.tsx`, `messages-client.tsx` and `briefing-bell.tsx`. The worker dashboard is the crew screen used on a phone outdoors, which is precisely where dark mode gets used. `.ch-stat-delta.up/.down` (`:412-413`) has the same defect. **Fix:** convert to custom properties, override in the existing dark block at `:158-179`.

2. **Every gradient flashes light on load in dark mode.** `useIsDark()` is duplicated verbatim in `gradient-tile.tsx:25-37`, `stat-tile.tsx:25-37` and `avatar.tsx:26-38`, each initialising to `false` and correcting in `useEffect`. SSR and first paint always emit the light palette. On the dashboard that's a dozen elements strobing. **The fix is already written and unused:** `gradientVars()` at `gradient-tokens.ts:63-74` emits the CSS custom properties for exactly this. Delete the three hooks, consume `gradientVars()`, add one dark remap rule. Removes three `"use client"` boundaries as a bonus.

**Then, in priority order:**

3. **Collapse four status vocabularies into one.** `.ch-pill` (`globals.css:455-493`), `KireiPill` (`ui/kirei/pill.tsx:44-51`), leads `STAGES` (`lead-shared.ts:23-29`), and `STATUS_GRADIENT` icon tiles (`invoices-client.tsx:183`). "Paid" is a warm mint pill on /messages, a saturated ALL-CAPS emerald pill on /invoices, and an emerald gradient square on the same row. Make `KireiPill` the single primitive, re-source its tones from the Connected Hub tokens rather than raw Tailwind, keep `.ch-pill`'s leading dot (helps colour-blind users) and its 11.5px sentence case (more legible in sunlight than 10px caps), and rewrite `.ch-pill` as a thin alias.

4. **Desaturate.** `KireiAvatar` hashes names into nine fully-saturated gradients (`avatar.tsx:12`, `gradient-tokens.ts:12-29`) — a 50-row customer list is a rainbow where colour means nothing, which trains the user to ignore colour exactly where you later need it to shout. Reduce to 4-5 teal tints, or go flat muted like Linear and Stripe. Same for the dashboard's four differently-coloured quick actions (`dashboard-client.tsx:150-153`) — four equal actions implying a taxonomy that doesn't exist. A tradie evaluating you against ServiceM8 and Tradify, whose entire claim is calm simplicity, reads visual noise as "app-builder template".

5. **Invert the invoice row hierarchy.** `invoices-client.tsx:170-200`: a 40px saturated gradient tile carrying zero information leads, and the *money* renders at `text-sm font-semibold` — same weight as the customer name. Drop the tile (status is already in the pill), render the total `text-base font-bold tabular-nums` right-aligned. The row is also a table pretending not to be one (`w-24`/`w-28`/`w-32` spans, `divide-y` divs, `flex-wrap` that reflows to ragged heights at tablet width) while seven other views use real `.ch-table`. Convert to `.ch-table` at `md:` and up, keep cards below.

6. **`layout.tsx:9` sets `themeColor: "#2563eb"`** — bright blue from the abandoned `:root` theme. On an installed PWA and on Android that's the browser chrome and status bar. It is the first colour a customer sees on their phone, and it belongs to a design system you don't use. Set it to the teal or the canvas pair, and delete the dead `:root` blue block at `globals.css:40-102` (which also carries a second, contradictory radius scale).

7. Lower priority: standardise on one KPI treatment (`.ch-stat` vs `StatTile`, and `StatTile:53` hardcodes `rgba(255,255,255,0.55)` — glary on a dark tile); consolidate the two empty-state treatments and make `cta` required (a first-run user staring at eight empty screens with no CTA is your most expensive conversion failure); replace literal px radii in `.ch-*` (`globals.css:382,420`) with the token.

---

## 5. Competitive position

### Where you genuinely win
- **First-party MCP server with full OAuth 2.1.** Nobody else has this. The only comparable thing in the market is an unofficial community wrapper around the Housecall Pro REST API. A tradie adds Kirei as a claude.ai connector and runs their business by talking to Claude.
- **One tool registry serving MCP *and* the in-app assistant** (`register-tools.ts` takes a `ToolFn`; `collect.ts` reuses it). Every competitor's AI is bolted onto a fixed feature list. Yours *is* the app.
- **Undo on agent actions** (`src/lib/assistant/undo.ts`) — the answer to the only objection a tradie will raise ("what if it stuffs up my invoices").
- **Native e-signature contracts at zero marginal cost.** Competitors either don't do contracts or make you pay a third party.
- **GHL-class CRM inside a trades product** — lead dedup at the database level, public forms with embeds, onboarding forms. Getting this alongside ServiceM8 costs USD $97–497/mo from GoHighLevel. It is currently invisible in your marketing.
- **Worker isolation in the database** rather than the UI (once B9 is fixed).

### Where you lose
- **No Xero/MYOB/QuickBooks. At all.** I grepped: the only hit in `src/` is a prompt string in `email-leads/route.ts:150`. Every competitor leads with two-way Xero sync. In Australia the bookkeeper has veto and will not accept re-keying invoices. **Nothing else on this list matters until Xero exists.**
- **Android isn't shipped.** The `.aab` is built; the first Play release needs a manual Console upload that hasn't happened. ServiceM8's most-cited weakness in AU reviews is being iOS-only. This is your single clearest wedge against the market leader and it's sitting behind a form upload. Hours of work.
- **No offline capability.** `mobile/` has AsyncStorage and MMKV but no write queue or sync reconciliation. A roofer in a Telstra blackspot who loses a job photo churns that week and tells other roofers.
- **No GPS** (no `expo-location`). Any business with 3+ vehicles asks on the first call.
- **No migration path in.** No importer for ServiceM8, Tradify or a customer CSV. Switching costs are the entire moat in this category.
- **No job-costing page.** `get_job_costing` exists as an MCP tool, but margin-per-job is the specific reason AU/NZ tradies leave Tradify for Fergus. It needs to be a page an owner opens weekly.
- One Supabase project for local/preview/prod. 14 test files against 88k lines.

### Positioning
**"ServiceM8 for Android, that you can run by talking to it."** Australian trades, 2–10 people. Not solo tradies (ServiceM8's free tier owns that and you can't win a price war), not commercial contractors (simPRO owns it, you have no project management), and emphatically not agencies.

Three attackable weaknesses: (1) ServiceM8 has no Android — ship yours; (2) everyone else charges per user, which is the loudest complaint in every review corpus — charge per business; (3) ServiceM8 and Tradify have no CRM — you have one already.

Lead marketing with jobs, quotes, invoices, photos and Android. The AI is the closer, not the opener: a 90-second demo of *"quote the Henderson roof, three days, two guys, send it"*. Tradies don't buy "AI-powered", they buy "I did my quoting in the ute in four minutes."

### Pricing
Flat per business, AUD ex GST, unlimited users, no job caps.

| Tier | Price | Includes |
|---|---|---|
| **Solo** | A$79/mo | 1–2 users, unlimited jobs/quotes/invoices/photos, portal, Xero, iOS + Android, AI (~300 msg/mo) |
| **Crew** | A$149/mo | Up to 10 users, + leads & public forms, contracts + e-sign, recurring billing & card-on-file, job costing, SMS, unlimited AI |
| **Business** | A$299/mo | Unlimited users, multi-business, API + MCP, priority support, custom branding |

**Crew is the whole argument.** A$149 for 10 users vs Tradify ~$520, Fergus ~$440, Jobber ~A$530, simPRO ~$700–1200 plus $3–10k implementation and a multi-year contract escalating ~8%/yr. You are 3–4x cheaper at team scale and that's a sentence tradies repeat to each other. Below ~4 users the per-user products beat you — accept it, that's why Solo exists.

Solo at A$79 deliberately matches ServiceM8 Growing, which caps at 150 jobs/mo. Same price, no cap, plus Android. **Do not build a free tier** — ServiceM8's is backed by a decade of scale and would only buy you support load. 14-day trial, card at the end.

Keep the 2% Stripe platform fee (already the default). Leave card surcharge off by default — it's regulated in AU and your Settings warning is correct. Hold annual billing until you have a churn number worth protecting; annual prepay on a product with no error monitoring is a refund liability.

**One caution:** unlimited AI on Crew at A$149 is unmodelled, and every tool call ships a full business snapshot. Instrument per-business token cost from customer one and reuse the `seo_monthly_budget_cents` cap pattern you already built.

---

## 6. Cut list

You have permission to delete all of this.

**Cut outright:**
- **The entire SEO Production plugin** — `src/app/(dashboard)/seo`, `src/lib/seo/*`, 7 tables, 13 markdown agents, the `seo_jobs` runner, budget caps, Opportunity Scout, six publish gateways, the GSC OAuth connector, the kireihq GitHub App. Largest single body of code in the repo, serving a market that isn't trades, with zero paying users and almost no shared surface with the job/invoice core. It also carries live operational burden: a Google OAuth app in Testing mode with 7-day token expiry, an `APP_ENCRYPTION_KEY` that can never be rotated, and per-run Anthropic spend. If SEO is a real business, it's a separate product with a separate repo.
- **Content Studio** (`src/app/(dashboard)/content`). Same argument, newer, less sunk cost. A roofer does not want a social content pipeline.
- **Prospects / outbound** (`import_prospects`, `email_prospects`, `bulk_update_prospects`, `convert_prospect`). Cold-outreach tooling for agencies. Also drags you toward spam-compliance obligations you don't want.
- **The agency industry preset and the multi-vertical ambition** in `docs/SEO_AGENCY_PLAN.md`. Keep the plugin machinery (`src/lib/plugins`) — it's cheap and it's your on/off mechanism. Kill the pretence that Kirei serves agencies. Two verticals at 2 active users is how you end up with neither.
- **Expenses, inventory, assets** — check the DB first; if the roofer doesn't use them, ship as stubs or remove. ServiceM8 users complain its inventory module is weak and mostly don't use it; simPRO's depth here is exactly what makes it unusable for small operators. Keep timesheets if it's actually used.

**Merge / stop treating as a supported feature:**
- **The Quoting Agent as a separate surface** — its own onboarding, settings page, `/api/quoting-agent` endpoint, prompt-caching strategy and memory contract. The main assistant already has `create_quote` and the full registry. Fold the pricing knowledge into the assistant's context and delete the surface. **Keep `quoting_agent_knowledge`** — per-business pricing memory is genuinely valuable.
- **One of the two form builders.** `/onboarding-forms` and `/forms` already share the field engine but ship two builders, two viewers, two MCP tool sets, two buckets, two mental models. Public lead-capture is the one that acquires customers. Merge onboarding into it as a delivery mode.
- **Bookings** — real, but fifth priority behind Xero, billing, offline and Android, and carrying ~10 MCP tools and a settings surface right now.
- **The MCP OAuth authorization server** — painful, because it's the best engineering in the repo. But it exists to serve claude.ai custom connectors, which no trades customer will configure. Header-key auth covers Claude Code and your demos. Keep the code, stop supporting it. (Fixing B10 first is still required if you leave it live.)
- **Smart Organise as eight per-entity proposers and eight buttons.** Keep the undo machinery — it's load-bearing for the assistant. The proposers are polish on a data-quality problem that businesses with 42 lifetime invoices don't have. (It also has a latent bug: the unbounded FK scans at `cleanup.ts:202-218` truncate at PostgREST's 1,000-row cap, and `invoices.customer_id` is `on delete set null`, so a blank-fields customer can be hard-deleted leaving an orphaned invoice.)

**Docs to delete or fix (30 minutes total, they're actively misleading agents):**
- `AGENTS.md` — a sed-substituted fork of CLAUDE.md, 41 lines behind, referencing a branch that doesn't exist (`:10`) and "the Codex.ai connector" (`:207-209`) for an OAuth flow built for claude.ai. Replace with a one-line pointer.
- CLAUDE.md declares contracts both "shipped" (`:411`) and "Not started — design from scratch" (`:442`). Delete `:442`.
- CLAUDE.md `:157-169` documents 7 nav sections (there are 10) and a `NavItem.feature` gating key that **doesn't exist** — the real one is `plugin?: string` (`app-sidebar.tsx:17-24`). Following the documented recipe produces code TypeScript rejects.
- CLAUDE.md `:10,12` point at `SCOPE.md` and `docs/invoicer-scope-and-flow.*` — neither exists. `:13` calls the SEO plan the "NEXT BIG INITIATIVE" while the plan itself says "P0–P4 SHIPPED".
- `docs/MOBILE_PARITY_PLAN.md:9-18` says mobile is "worker-only"; CLAUDE.md:7 says it has full parity. Either refresh it or retitle it "historical" and delete the standing rule at CLAUDE.md:531-534. A dead rule devalues the live ones.

---

## 7. The 2-week plan

One developer. Ordered. Nothing here is optional except where noted.

### Week 1 — stop the bleeding, then get paid

**Day 1 — Security (must ship together)**
- RLS migration for `sms_conversations`, `sms_messages`, `report_sessions` + Realtime filter · **2h** · B1
- `requireCron()` helper across 14 routes; verify `CRON_SECRET` in every Vercel env; redeploy · **1h** · B2
- Worker isolation migration for `sites`, `contacts`, `billing_profiles`, `leads`, `customer_notes` · **2h** · B9
- Delete the `INTERNAL_API_KEY` fallback in `src/lib/api-auth.ts` (check `vercel env ls` first; migrate the Telegram report-sessions integration to a real per-business key) · **1h**
- Set `SENTRY_DSN`; top up `ANTHROPIC_API_KEY` · **15m** · B8

**Day 2 — Money correctness**
- `addPayment` error handling + amount validation · **30m** · B4
- Mark-paid writes a balancing payments row · **2h** · B5
- Currency: persist `default_currency`, refuse mismatch, change schema default · **3h** · B6
- Gate `booking-db.test.ts` behind `RUN_DB_TESTS=1`; add `.gitattributes` with `* text=auto eol=lf` so the local suite stops being red · **1h** · B7

**Day 3 — Error boundaries + confirmations** *(the two highest-visibility polish items)*
- `error.tsx` + `not-found.tsx` at dashboard and root, composed from PageHeader + EmptyState · **3h** · P2
- AlertDialog on the six unconfirmed deletes · **2h** · P1
- `page-header.tsx:30` truncate→break-words; `.ch-table` cursor fix · **15m** · P8/P10

**Days 4–5 — Subscription billing** · **~2 days** · B3
Stripe Billing on the platform account. `plan` + `trial_ends_at` on `businesses`, webhook, paywall in `(dashboard)/layout.tsx`, one billing page. Three prices, no proration. **This is the thing that makes the product sellable.**

### Week 2 — make it look and behave like a product you charge for

**Day 6 — Email paths**
- Route `invoice-reminders`, `quote-followup`, `workorder-complete`, `reminders` through `buildBusinessFrom` + `replyTo` + `getResolvedEmailTemplate` (copy `process-scheduled-sends:119,184`) · **3h** · P4
- Add the portal + pay link to the overdue reminder · **2h** · P3
- Fan out or delete `/api/cron/reminders` · **1h** · P5

**Day 7 — Design bugs**
- `.ch-pill` and `.ch-stat-delta` dark-mode variants · **2h**
- Delete the three `useIsDark` copies, consume `gradientVars()`, add the dark remap · **2h**
- `themeColor` fix + delete the dead `:root` blue block · **30m**

**Day 8 — Design consistency**
- Collapse to one status pill primitive; delete `STATUS_GRADIENT` · **3h**
- Desaturate the avatar pool and the dashboard quick actions · **1h**
- Invert the invoice/quote row hierarchy (money loudest, tile gone) · **2h**

**Day 9 — Cut day.** Delete SEO, Content Studio, Prospects. Fix the six doc contradictions. Write a root README and expand `.env.local.example` from 9 to ~21 variables grouped Required / Payments / Optional — right now no single artifact answers "what must I set to run this?", and that knowledge is unrecoverable once you forget it. · **1 day**

**Day 10 — Prove the money path works.**
Add "Section 27 — Getting paid" to `docs/QA_CHECKLIST.md` (which currently has **zero** occurrences of the word "stripe" across 447 lines) and run it end-to-end in live mode with a real card: Connect onboarding → invoice email pay-link → portal card payment → deposit on quote accept → saved-card autopay → surcharge maths → receipt email. Add `src/lib/__tests__/stripe-amounts.test.ts` and `payment-methods.test.ts` while you're in there (~1h, both are pure functions with zero coverage today). · **1 day**

### Immediately after — the two that decide whether you have a business
1. **Upload the Android `.aab` to Play Console.** Hours of work, converts your best competitive claim from theoretical to true.
2. **Build Xero sync.** Weeks, not days. But in Australia the bookkeeper has veto, and until it exists every deal dies in the same place.

Everything on the cut list is what buys you the time to do those two.

---

## Appendix — findings rejected by the verification pass

These were raised by an audit agent and then **refuted** when a second agent checked them against the real code. They are listed so the reasoning is not lost.

### The invoice/parent payment rollup is implemented twice, differs between the two copies, and neither copy is tested

REFUTED on its central claim. The finding says the two copies "already differ" because recomputeParent preserves cancelled/draft while addPayment "unconditionally overwrites status (invoices.ts:370)". That comparison is apples-to-oranges: invoices.ts:370 is the recompute of the invoice ITSELF, whose counterpart is recomputeInvoice (stripe-payments.ts:186) — and that one is also unconditional. I read invoices.ts:400-420, which is the actual parent branch, and it is behaviourally identical to recomputeParent, including the same guard verbatim: `if (currentStatus !== "cancelled" && currentStatus !== "draft")` at invoices.ts:412, same 0.01 tolerance, same amount_paid formula. The two implementations agree. What IS true: the logic is duplicated in two places and no test file imports either module. But the asserted divergence — the whole basis for the 'high' severity and the 'cancelled invoice flips back to partial' impact — does not exist in the code.

### The pragmatic minimum suite before charging customers: five files, roughly two days

Not a finding — this is a work plan assembled from the other eight items, so there is nothing to confirm or refute as a defect. Its underlying facts do check out (the cited files and line ranges are accurate, and I independently confirmed the zero-coverage claims on stripe.ts, payment-methods.ts and the rollup). But item 2 of its plan rests on the payment-rollup 'divergence' I refuted above, and it should not carry a severity or appear in a findings list. Fold its recommendations into the individual findings instead.

### CLAUDE.md documents /api/agent as both live and retired; the 2,151-line "dead" route is still in the tree

The documentation contradiction is real (CLAUDE.md:181 describes /api/agent as the live floating panel with 65 tools; CLAUDE.md:264 calls it "the old /api/agent" with 79 tools). But the finding's load-bearing claim — that the route is dead and should be deleted — is REFUTED. src/components/agent/agent-panel.tsx:246 still does `fetch("/api/agent", ...)`, and src/components/layout/dashboard-shell.tsx:13-14,82 dynamically imports and renders `<AgentPanel />` on every dashboard page. Both routes are live: /api/assistant backs the /assistant page, /api/agent backs the floating panel. Following this finding's recommendation ("Delete src/app/api/agent/route.ts") would break the in-app floating assistant in production. Task #73 "retire /api/agent" is indeed marked completed while the route still serves traffic — that is the real, narrower issue, but it is a task-tracking/architecture gap, not the dead code the finding describes.

