# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Invoicer / **Kirei** is a multi-business field-services SaaS — a hybrid of ServiceM8 (jobs, scheduling, photo-driven submissions) and GoHighLevel (CRM, leads, automations). Production runs at `kireihq.com` (with `invoicer.crownroofers.com.au` as a backwards-compat alias). The companion React Native app at `mobile/` — also called **Kirei** — is no longer the worker-only "Connected Hub" of earlier docs: it now has full feature parity with the web (sales pipeline, AI agent, quoting, settings, etc.) plus a worker-specific mode for crews. See `mobile/DEPLOY.md` for the TestFlight / Play Internal Testing pipeline (EAS Build / Submit).

Pile of docs / scope artifacts:
- `SCOPE.md` (on the `claude/dreamy-robinson-9fcc52` branch in PR #162) — authoritative ServiceM8+GHL scope
- `scripts/sync-scope.mjs` — reconciles `SCOPE.md` checkboxes with GitHub Issues
- `docs/invoicer-scope-and-flow.{html,pdf}` — recent printable scope & flow checklist

## Commands

Web app (root):

```bash
npm run dev      # Next dev server on :3000 (Turbopack)
npm run build    # Production build — runs tsc across the repo
npm run lint     # next lint
npx tsc --noEmit # Standalone typecheck — what production build runs
```

Mobile app (`mobile/`):

```bash
cd mobile
npm install --legacy-peer-deps     # peer-dep churn from expo-router 6 vs constants 18
npx expo start --tunnel            # tunnel via ngrok — works over cellular
npx expo start --lan               # phone must share wifi
```

Mobile reads `.env` (copy from `.env.example`). Use the same `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as the web app's `.env.local`.

Database migrations (Supabase CLI is linked to project `huwlasrvbtbyxvmmfpwm`):

```bash
supabase db push                                          # apply pending migrations (often drifts; prefer the next one)
supabase db query --linked --file <path-to-migration>     # one-off SQL execution
supabase migration list                                   # local vs remote diff
```

The migrations table drifts because not every PR's migrations get pushed cleanly. The reliable workflow: write the migration file, apply it with `supabase db query --linked --file`, then **manually record** it in the tracking table:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('YYYYMMDDHHMMSS', 'description')
ON CONFLICT (version) DO NOTHING;
```

Vercel:

```bash
vercel logs                                               # tail prod logs (errors land as serverless 500s with Postgres codes)
vercel ls                                                 # latest deployment statuses
vercel inspect <url> --logs                               # build log of a specific deploy
vercel env pull --environment=production --yes /tmp/env   # check what's set
vercel --prod --yes                                       # force a fresh production deploy (occasionally needed when a merge to main doesn't auto-trigger)
```

## Big-picture architecture

### Multi-tenancy via `business_id` + RLS

Every business-data row carries `business_id`. RLS is the **only** security gate — server actions don't filter by user, they just query. Two helpers carry the load:

- `src/lib/active-business.ts` — `getActiveBizId(supabase, userId)` reads from the `active_business_id` cookie (RLS catches cookie tampering at query time)
- `src/lib/supabase/server.ts` — Supabase server client wired to Next cookies via `@supabase/ssr`

A user can own multiple businesses (`businesses.user_id`) AND be a member of others (`business_members`). The `BusinessSwitcher` in the sidebar flips the cookie + calls `router.refresh()`.

### Roles

`src/lib/permissions.ts` defines the role union: `'owner' | 'admin' | 'editor' | 'viewer' | 'worker'`. Owner is derived from `businesses.user_id` and never stored in `business_members`.

**Worker is a hard-isolation role** — they only ever see the work orders assigned to them. The isolation lives in the database via SECURITY DEFINER helpers used by RLS policies on every sensitive table:

- `is_business_worker(biz_id)` — denies access to invoices/customers/quotes/leads/etc.
- `my_member_profile_ids(biz_id)` — narrows work_orders to assigned rows
- `link_my_member_profile()` — runs on every dashboard load (and mobile sign-in) to wire `member_profiles.user_id` to the auth user when emails match. Called from `src/app/(dashboard)/layout.tsx` and `mobile/app/_layout.tsx`.

**Adding a new business-data table?** Mirror the existing `<table>_no_workers` policy pattern in `supabase/migrations/20260430000001_worker_role_and_isolation.sql` or workers will see it.

### Server actions are the API

`src/lib/actions/*.ts` is the entire API surface. Every file is `"use server"`, exposes flat-scalar-arg functions, and is **AI-tool-first** — designed to be invokable by an AI assistant or voice prompt, not just clicked through a form. When adding a feature: write the server action first, then UI on top.

Conventions:
- Always `await createClient()` then `supabase.auth.getUser()` and throw on missing user
- Always resolve `businessId` via `getActiveBizId(supabase, user.id)` — don't trust client-passed business ids
- Coerce empty strings to `null` for UUID/date columns; Postgres rejects `""` with `22P02`. Pattern from `src/lib/actions/work-orders.ts`:
  ```ts
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uid = (v) => v && UUID_RE.test(v.trim()) ? v.trim() : null;
  ```
- After mutations: `revalidatePath()` the affected page(s)
- New columns: write the migration in `supabase/migrations/`, apply via `supabase db query --linked --file`, update `src/types/database.ts`
- **Expose it over MCP**: any new capability also gets a tool in `src/lib/mcp/register-tools.ts` (see the MCP section). This is a hard rule, not optional.

### Mobile app talks to the same Postgres

`mobile/` is Expo SDK 54 + expo-router using `@supabase/supabase-js` directly — RLS does the filtering, no separate API. Photos go to the `work-order-photos` Supabase Storage bucket; bucket policy requires the path's first segment to equal `auth.uid()::text`. `babel.config.js` uses `react-native-worklets/plugin` (Reanimated 4 dropped its in-tree plugin).

**Theme system** — `mobile/src/lib/theme.ts` exports mutable `colors` + `gradients` singletons swapped in-place by `applyTheme("light"|"dark")`. `mobile/src/lib/theme-provider.tsx` wraps the app, reads OS color scheme + AsyncStorage override, force-renders on swap. Three modes: System / Light / Dark, picker on `/settings/appearance`.

**Module-scope style consts are frozen across theme swaps.** Anywhere we do `const input = { backgroundColor: colors.card, ... }` at module level, the value is captured once and never updates. Convert to a function: `const input = () => ({ ... })` and call `style={input()}` so it re-reads on every render. This bit auth screens (login/forgot/signup) and customer/lead/report `/new` forms.

**Responsive layouts** — `mobile/src/lib/responsive.ts` exports `useResponsive()` returning `{ isTablet, isLandscape, isWide, gridColumns, gridBasis: "%", containerStyle }`. Tablet threshold is 768px on smallest dimension. Dashboard KPI grid switches 2/3/4 columns; detail screens cap at `maxWidth: 820`. `app.json` orientation is `"default"` so landscape works.

**Bearer-auth API routes** — mobile uses bearer tokens (not cookies). The middleware (`src/lib/supabase/middleware.ts`) is cookie-only and would redirect bearer requests to `/auth/login` (resulting in HTML responses → "JSON parse error: unexpected <"). Routes that handle their own bearer auth (`/api/mobile/*`, `/api/ai/transcribe`) are whitelisted when the request carries `Authorization: Bearer …`. To add another bearer-auth endpoint, add it to `isBearerAuthRoute` in the middleware.

**Design-system components** under `mobile/src/components/` are the visual primitives — every new screen should compose them rather than inventing styles:
- `Avatar` — hashes name → gradient pool, consistent per-name colour across the app
- `EmptyState` — gradient halo + optional CTA
- `Skeleton` / `SkeletonRow` / `SkeletonCard` — shimmer placeholders for first-load
- `AnimatedNumber` — count-up via Reanimated shared value
- `BrandedRefresh` — RefreshControl with brand tints
- `GradientCard`, `AnimatedPress`, `FadeIn`, `PatternBackground` — primitives
- `Confetti` — fires when invoice flips to paid (one-shot via `<Confetti fireKey={n} />`)
- `StatusPill` — single gradient pill covering invoice/quote/lead/job tones; pass `tone={statusString}`
- `GradientTabBar` — custom bottom tab bar with active gradient pill + haptics

### Web routing & layout

- `src/app/(dashboard)/layout.tsx` — auth gate, business resolution, role detection, `link_my_member_profile()` call, worker path-redirect
- `src/proxy.ts` — Next 16 renamed `middleware.ts` → `proxy.ts`. Forwards `x-pathname` so server components can route by URL
- `src/components/layout/dashboard-shell.tsx` — single `<main>` wrapper at `w-full p-6` with **no max-width cap** (the prototype is 240px sidebar + 1fr content). Pages should NOT add their own `max-w-*` outer wrappers — only narrow forms (e.g. `/customers/new` at `max-w-2xl`) keep their own caps for readability.
- The shell `<div key={business.id}>`-keys content so switching businesses fully remounts the tree (works around `useState(initial)` not syncing on prop changes — see Known traps).

### Theme — Connected Hub design system

The active theme is set via `<html data-theme="console">` in `src/app/layout.tsx`. The Connected Hub palette in `src/app/globals.css` under `[data-theme="console"]`:

- Canvas: warm off-white `#fafaf7` · cards: pure white · borders: warm-grey `#e5e3d9`
- Primary/accent: deep teal (`oklch(0.55 0.08 195)` ≈ `hsl(191 38% 36%)`)
- `--radius: 0.625rem` (10px) so `rounded-md/lg/xl` resolve to **8 / 10 / 14 px** matching the prototype's `--r-md / --r-lg / --r-xl`
- Card defaults to `rounded-xl + border-border + shadow-sm`
- Button defaults to `rounded-md` (NOT pill — that was the earlier flux pass)
- Default sidebar theme is `light`; default accent is `teal`
- `data-accent`, `data-sidebar-theme`, `data-pattern` overrides in globals.css drive Settings → Appearance customisation

**Connected Hub utility classes** at the bottom of `globals.css` (prefix `.ch-*`) are the prototype's design vocabulary. List pages compose with them rather than ad-hoc Tailwind:

- `.ch-page-header / .ch-page-title / .ch-page-subtitle / .ch-page-actions` — every list/detail header. Use `<PageHeader>` from `@/components/layout/page-header`.
- `.ch-stat-grid` + `.ch-stat` — KPI strip above tables
- `.ch-table-wrap + .ch-table` with `.num` (mono-aligned), `.ref` (mono refs)
- `.ch-pill {status}` — status badges (paid / pending / overdue / draft / scheduled / sent / partial / cancelled / accepted / rejected / new / contacted / quoted / won / lost / active / archived / in-progress / completed / declined)
- `.ch-tabs / .ch-tab.active` with bottom-border accent + count badge
- `.ch-bars / .ch-bar.primary` (mini bar chart) and `.ch-spark / .ch-spark-fill` (sparklines)
- `.ch-schedule-item / .ch-activity-item / .ch-quick-action` for dashboard widgets
- `.ch-empty / .ch-mono / .ch-tnum`

### Sidebar & nav structure

`src/components/layout/app-sidebar.tsx` groups nav into 7 sections:
- **Workspace** — Dashboard · Assistant · Messages · Tasks
- **Sales** — Leads · **Quoting Agent** (feature-flagged) · Quotes · Invoices · **Site Reports** · Recurring  *(Site Reports = client-facing inspection / scope-of-work PDFs, NOT analytics)*
- **Service** — Work Orders · Schedule
- **Contacts** — Customers · Contacts
- **Catalog** — Products
- **Workforce** — Team · Agents  *(team access-level management lives at `/team`, not `/settings`)*
- **Insights** — Analytics
- **Account** — Help · Settings (footer)

Active state is a subtle bg + 2px teal left-rail (spring-animated via `layoutId="sidebar-active-rail"`). Worker role hides items via the `worker?: boolean` flag.

**Conditional nav items** — `NavItem.feature?: "quotingAgent"` is gated on the `features` prop threaded through `DashboardShell`. `(dashboard)/layout.tsx` fetches `quoting_agent_settings.enabled` and passes the result down. To add another conditional item: add the feature key, server-fetch the flag, plumb it through.

### Loaders & route progress

`src/components/layout/route-progress.tsx` — top-of-page 2px teal bar fires on every URL change. Mounted once in `dashboard-shell.tsx`.

`src/components/layout/app-loading.tsx` — `<AppLoadingProvider>` + `useAppLoading()` context with a single `setBusy(label | null)` API. While busy, a soft scrim + spinner pill covers the app. `BusinessSwitcher` uses this to give visual feedback during `router.refresh()`.

`src/components/ui/spinner.tsx` — `<Spinner size="xs|sm|md|lg" />`, `<LoadingRow />`, `<FetchingPill />` for inline use.

`src/app/(dashboard)/loading.tsx` — route skeleton mirroring the prototype's PageHeader + KPI strip + table shape so the canvas doesn't reflow when content streams in. Per-segment `loading.tsx` re-exports this for products / tasks / contacts / reports / recurring / team / agents / settings.

### AI assistants — three of them

**Web `/api/agent`** (the dashboard-floating panel) — cookie-auth, streams, 65 tools across every entity (customers / sites / contacts / billing / workers / work-orders / photos / time / materials / quotes / invoices / leads / recurring / portals). Multi-turn tool chain up to 15 iterations. Live context snapshot built by `getAgentContext(pathname)` in `src/lib/actions/agent-context.ts` — business info, current page, stats, recent customers/invoices/quotes/jobs/leads with IDs — sent with every turn so the model resolves pronouns ("this invoice", "today's jobs") without re-searching.

**Mobile `/api/mobile/agent`** — bearer-auth, smaller surface (9 tools, read-mostly: search customers/invoices/quotes/leads, get_briefing, get_today, mark_invoice_paid, mark_quote_status, set_lead_status). Multi-turn (10 iterations). Critically, the mobile chat client keeps a full Anthropic `apiHistory` (including tool_use + tool_result blocks) and sends it back each turn. Server returns the updated history; client persists it. **This is how the agent remembers tool calls across turns** — if turn 1 it ran `search_customers` and got Sarah's ID, turn 5 still has it. Plus `mobile/src/lib/agent-context.ts` builds a fresh business snapshot (stats + recent records) on every send. **Don't change the message-shape contract** — sending plain `{role, content: string}` instead of the full block-array would amputate the cross-turn memory.

**Quoting Agent `/api/quoting-agent`** — see dedicated section below.

### Quoting Agent

A specialised AI agent for generating quotes using a per-business pricing knowledge bank. Lives at `/quoting-agent` with its own onboarding, settings, chat surface, and conditional sidebar tab.

**Tables:**
- `quoting_agent_settings` (one row per business) — `enabled`, `onboarded_at`, `industries[]`, baseline rates (hourly, margin %, tax %, call-out fee, emergency multiplier), `estimation_mode` (`manual` | `ai_estimate` | `skip`), `business_notes` (free-form context the agent always sees).
- `quoting_agent_knowledge` — the agent's long-term memory. Rows keyed by `(business_id, kind, key)` unique. `kind` ∈ `material | labour | margin | scope_template | rate | note`. `source` ∈ `user | ai_estimate | imported`. `confirmed` flag — AI estimates default to `false` so the UI can flag them.

**Server actions** (`src/lib/actions/quoting-agent.ts`): `getQuotingAgentSettings` (lazy-creates), `setQuotingAgentEnabled`, `updateQuotingAgentSettings`, `completeQuotingAgentOnboarding`, knowledge CRUD + `bulkAddKnowledge` for the onboarding seed.

**Endpoint** (`src/app/api/quoting-agent/route.ts`) — cookie-auth, 12-iteration multi-turn loop. Tools: `lookup_knowledge`, `list_knowledge`, `save_knowledge` (the agent writes its own memory), `update_knowledge`, `delete_knowledge`, `search_customers`, `create_customer`, `create_quote`. System prompt is generated per request from the business's settings so the agent has all defaults inline. When estimation_mode = `ai_estimate` and a price is missing, the agent saves it with `source='ai_estimate'`, `confirmed=false` and flags it in the reply.

**Pages**:
- `/quoting-agent` — enable card → onboarding redirect → chat surface
- `/quoting-agent/onboarding` — 4-step wizard (industries → rates → estimation mode → seed knowledge)
- `/quoting-agent/settings` — disable toggle, baseline rates editor, full knowledge-bank manager (grouped by kind, inline edit/delete, "Unconfirmed estimate" badge for AI rows)

**To extend**: adding a new tool means a JSON-schema entry in the `TOOLS` array + a branch in `runTool()`. The agent's memory persists across the conversation (server returns `messages` history; client sends back) — same shape contract as the mobile agent.

### MCP server — drive the app from Claude Code / claude.ai

A remote **Model Context Protocol** server at **`/api/mcp`** (`mcp-handler` package) lets Claude Code, the Claude API, and the **claude.ai connector** operate a business end-to-end. ~50 tools across every entity.

- **Endpoint**: `src/app/api/mcp/route.ts` — `createMcpHandler` wrapped in `withMcpAuth`. Stateless Streamable HTTP (no Redis).
- **Tools**: `src/lib/mcp/register-tools.ts` — every tool reads business context from the authed key, checks its scope (`assertScope`), and runs against the **admin Supabase client scoped by `business_id`** (same pattern as `/api/v1` — MCP requests are API-key-authed, NOT cookie, so the cookie-bound server actions can't be reused directly). Helpers in `src/lib/mcp/context.ts`.
- **Heavy ops** (quote/invoice PDF + email) reuse the exact pure helpers the web app uses (number-mint, `invoiceEmailHtml`/`quoteEmailHtml`, PDF renderers, `sendEmail`, `buildBusinessFrom`) so output is identical. WO/invoice numbers are minted from `businesses.<x>_prefix` + `<x>_next_number` (read-bump) — there is **no `next_work_order_number` RPC** (only `next_invoice_number` / `next_quote_number` exist).

**Auth — two ways in, same server:**
- **Header key** (Claude Code, API): `Authorization: Bearer inv_…` — the existing per-business API keys (Settings → API), validated by `authenticateApiKey()`.
- **OAuth 2.1** (claude.ai custom connector): full AS in front of the MCP endpoint — `src/app/api/oauth/{register,authorize,token}` + RFC 8414/9728 metadata at `src/app/api/oauth/meta/*` served at `/.well-known/*` via `next.config.ts` rewrites (App Router dot-folders are unreliable). Public client + PKCE S256. `/authorize` requires a kireihq.com login (login page honours a same-origin `?next=`) then shows a consent screen to pick a business. The token endpoint **mints an `inv_*` admin key as the access_token** — so the MCP layer is auth-method-agnostic and the connection is revocable in Settings → API. Tables: `oauth_clients`, `oauth_codes` (migration `20260522023813_mcp_oauth.sql`, service-role only).

**Scopes** (`ApiScope` in `src/types/database.ts`): `leads/customers/quotes/invoices/work_orders/tasks/products/settings` × `read|write`, plus `email:send`, `agent:access`, and the `admin` wildcard. `expandApiScopes()` turns `admin` into the full set. The Settings → API UI and `createApiKey` validator both derive from `ALL_API_SCOPES`, so new scopes appear + validate automatically.

**🔴 STANDING RULE — every new feature MUST get an MCP tool.** When you add a server action / capability (new entity, new mutation, new workflow), you also add the matching tool(s) to `src/lib/mcp/register-tools.ts` in the same PR: pick/extend a scope, write the zod schema, scope-check, run via the admin client scoped by `business_id`. The MCP surface is expected to stay at parity with the app's capabilities — treat "added a feature but not its MCP tool" as an incomplete change.

Middleware whitelists `/api/mcp`, `/api/oauth/`, and `/.well-known/` (they own their auth).

### Smart Organise (the cleanup agent)

`src/lib/actions/cleanup.ts` is a registry of **proposers** keyed by entity, plus generic `applyCleanup` and `undoCleanup`. Every applied run records the full change_log in the `cleanup_runs` audit table so undo reverses it.

Implemented entities (`CleanupEntity` union): `customers · contacts · leads · invoices · quotes · products · work_orders · team_profiles`. Each proposer is deterministic (no AI yet — the user said "AI Button" but heuristics-only ships first cut).

Apply path: order is **updates → deletes → merges** so a tidy doesn't run on a row a merge already absorbed. Each log entry stores `table` so undo works regardless of entity. Merge captures every FK relink with `row_id` so undo can flip them back precisely.

`<CleanupButton entity entityLabel />` lives in every list page's `<PageHeader actions>`. Modal has a progress bar + closes via `router.refresh()` so list components pick up the changes.

To add a new entity:
1. Add to `CleanupEntity` union
2. Write a `propose<Entity>Cleanup()` function returning `{ proposals, total_rows }`
3. Wire into the `switch` in `proposeCleanup()`
4. For merge proposals, list the FK columns that should be relinked
5. Drop `<CleanupButton entity="..." entityLabel="..." />` into the list's PageHeader

### PDF & email

- PDFs (`@react-pdf/renderer`): listed in `next.config.ts` under `serverExternalPackages` so it bundles correctly. Templates at `src/components/invoices/invoice-pdf-document.tsx`, `quote-pdf-document.tsx`, etc.
- Email (`src/lib/email.ts`): wraps Resend. `RESEND_FROM_EMAIL` is `Crown Roofers <invoices@crownroofers.com.au>` (domain verified).
- **Email number coercion**: PostgREST returns numeric columns as strings, which produces `NaN` if you do plain math. `src/lib/emails/invoice.ts` uses a `num()` helper — copy that pattern for any new email template.
- **PDF routes honor `?token=`**: `/api/pdf/{invoice|quote|report|work-order}/[id]` accept either an authenticated user OR a portal token query param. `proxy.ts` lets tokenised PDF requests through without auth; the route validates the token against `customer_portal_tokens` then fetches via the admin client. See `src/app/api/pdf/invoice/[id]/route.ts` for the canonical shape.

### Customer portal

Token-based per-customer pages at `/portal/{token}/...`:
- `/portal/{token}` — landing page
- `/portal/{token}/quote/{id}` — quote view + accept
- `/portal/{token}/invoice/{id}` — invoice view + balance + Download PDF (uses `?token=` on the PDF route)

The `customer_portal_tokens` table has `business_id`, `customer_id`, `expires_at`, `revoked_at`. `proxy.ts` whitelists `/portal/...` from auth-redirect.

### Lead dedup

`leads.identity_key` is a stored generated column from `lead_identity_key(email, phone, name, address)`. Unique index on `(business_id, identity_key)` makes the database physically refuse duplicates. The `upsert_lead(...)` SQL function is the single ingest entry point — `createLead`, `/api/v1/leads`, and the email-leads cron all call it. It computes the key, finds an existing match, and either inserts or merges (filling nulls, never overwriting user edits, appending the new source).

### Performance & caching

The big perf overhaul landed in May 2026 — context for anyone tempted to revert it:

- **No global `force-dynamic`** on the root layout. Dashboard pages become dynamic via `cookies()`/`headers()` automatically; don't add a blanket `export const dynamic = "force-dynamic"`.
- **`getUser()` is the cached helper** (`src/lib/auth.ts`). Every server action + page should use it, NOT raw `supabase.auth.getUser()` — the raw call hits GoTrue over the network and was the dominant TTFB cost before this fix (10× duplicated per request on chained-action pages like `/customers/[id]`).
- **List-fetch selects are slim** — `getInvoices` / `getQuotes` / `getWorkOrders` no longer `select("*")`. They pull only the columns list cards render and apply a default `.limit(200)`. Don't add `line_items`/`notes`/`terms`/`photos` to those queries; if a caller needs them, write a separate getter.
- **`next.config.ts` `experimental.optimizePackageImports`** lists `@phosphor-icons/react`, `lucide-react`, `framer-motion`, `date-fns`, `recharts`. New heavy barrels should join the list.
- **Atomic number-mint RPCs** — `next_invoice_number(uuid)` and `next_quote_number(uuid)` (migration `20260511020100_perf_atomic_number_mint.sql`). Replace any read-modify-write counter logic with these — they're race-safe and one round-trip.
- **Hot-path indexes** — `20260511020000_perf_indexes.sql` adds `(business_id, created_at DESC)` / `(business_id, status)` / FK indexes across all big tables. Adding a new business-data table? Mirror this index set or queries will seq-scan.
- **Fire-and-forget RPCs in layouts** — `link_my_member_profile()` is now `void sb.rpc(...).then(...)` rather than `await`-blocking. Anything similarly idempotent + best-effort should follow the same pattern.

### Excluded paths

`tsconfig.json` excludes `mobile/` from the Next typecheck and `.vercelignore` excludes it from the Vercel upload. Without that exclusion the prod build fails because `expo-router` etc. aren't in the root `node_modules`.

## Working flow

- Branch per change (`feat/...`, `fix/...`, `chore/...`); squash-merge to `main`
- After merge, Vercel auto-redeploys production. Occasionally a merge doesn't trigger — `vercel --prod --yes` from root forces it.
- For DB changes: ship the migration in the same PR + apply via `supabase db query --linked --file <path>` before merging
- Preview deploys exist; production won't update until the build is green

## Known traps (each cost a production fire to learn)

- **Don't `.catch()` on a Supabase query builder** — `PostgrestFilterBuilder` is thenable but doesn't expose `.catch()`. Use `try/catch` around `await`. Crashed `/dashboard` once (PR #178).
- **Empty strings to UUID columns** — always coerce. The new-WO crash (PR #172) was a worker name being passed into the `assigned_to` UUID column producing `22P02 invalid_text_representation`.
- **PostgREST returns numeric as string** — `total - amount_paid` produces NaN unless coerced through `Number()`. Bit the invoice email template (PR #196).
- **`useState(initial)` doesn't sync when props change** — switching businesses left the previous biz's rows visible. Fix: `<div key={business.id}>` in `dashboard-shell.tsx`, or `useEffect(() => setX(initial), [initial])` in the component. Already done in `AppearanceProvider`.
- **Always `select("id, ...")` on rows that link out** — `getDashboardStats` initially didn't select `id` so recent-invoice clicks went to `/invoices/undefined` (PR #189).
- **Cleanup runs: order matters** — `applyCleanup` runs `update → delete → merge`. A tidy update on a row a merge would have absorbed errors with "Cannot coerce result to a single JSON object" (PR #194).
- **`NEXT_PUBLIC_APP_URL`** must be set on Vercel or invite emails contain `localhost` links. Sensitive vars are hidden from `vercel env pull` — use `--no-sensitive` when adding it.
- **Don't add per-page `max-w-*` wrappers** on list/dashboard pages — the layout shell handles content width. Only narrow form pages (`/customers/new` at `max-w-2xl`) keep caps.
- **Resend domain verification** — `crownroofers.com.au` is verified. If you change `RESEND_FROM_EMAIL`, the new domain must also be verified or every send fails silently.
- **Vercel build runs tsc across the whole repo** — keep `mobile/` in `tsconfig.exclude` and `.vercelignore`.
- **Migration tracking drifts** — `supabase db push` often complains about missing local files for remote-only migrations. Use `supabase db query --linked --file` and manually `INSERT INTO supabase_migrations.schema_migrations`.
- **Auth middleware vs bearer tokens** — `src/lib/supabase/middleware.ts` only reads cookies. Mobile + voice-mic requests use `Authorization: Bearer …`. Routes that handle their own bearer auth (`/api/mobile/*`, `/api/ai/transcribe`) must be in `isBearerAuthRoute`; otherwise they get 307'd to `/auth/login` and the client sees "JSON parse error: unexpected <" parsing the HTML login page.
- **Whisper hallucinations** — the `/api/ai/transcribe` endpoint has three layers of defence (`src/app/api/ai/transcribe/route.ts`): segment-level filter (drop `no_speech_prob > 0.6` or `avg_logprob < -1.0`), `collapseRepeats()` adjacent-n-gram dedup, and an `isLikelyHallucination()` hard guard. Don't add a vocabulary-stuffing `prompt` parameter to the Whisper call — it makes the model repeat those exact words. Keep the prompt short + stylistic only.
- **Mobile module-scope style consts freeze across dark-mode swap** — see Mobile section above. If you write a `const xStyle = { backgroundColor: colors.card, ... }` at module level, convert to `const xStyle = () => ({ ... })` and call `style={xStyle()}`.
- **Mobile color tokens are mutated, not replaced** — `applyTheme()` does `Object.assign(colors, palette)` in place so existing imports keep working. Don't replace `colors` with a new object or downstream consumers will hold a stale reference. For new gradient pairs, mutate `gradients[name][0]` / `[1]` element-wise.
- **Progress invoice rollup** — `addPayment()` in `src/lib/actions/invoices.ts` recomputes `amount_paid` from truth (direct payments + sum of children's `amount_paid`) — both for the child being paid AND its parent. If you touch that function, preserve the recompute logic or paid deposits stop reflecting on parent invoices. Migration `20260510232842_progress_invoice_parent_rollup_backfill.sql` reconciles historical data.
- **Workers can read job customer rows** — `customers_no_workers` RLS hard-blocks workers from `customers`, but `workers_can_see_job_customers` is a permissive SELECT-only policy that lets a worker read the customer attached to a work order they're assigned to. Don't tighten the no-workers policy without re-checking this hole — workers need the customer's phone/email on their job-detail screen.

## Memory aids

User's accumulated preferences:
- **Voice/AI-first** — every workflow should be invocable by AI text or voice prompt; design server actions accordingly
- **Visual feedback for everything** — loading states on field-level fetches (e.g. `<AddressSelect>` "Loading addresses…"), progress bar on Smart Organise, scrim during business switch
- **Never trust empty input** — coerce, validate, soft-fail
- Current accent name: **teal**; sidebar: **light**; canvas: warm off-white. Don't revert to flux lime unless explicitly asked.

## Session log (June 2026) — Stripe payments + email templates (MOST RECENT — pick up here)

Big multi-day push: per-business email templates, then a full Stripe Connect payments stack. All shipped to `main` (production = kireihq.com) and DB migrations applied + recorded on remote.

### Per-business email templates
- `email_templates` table — one row per `(business_id, template_type)`, type ∈ `invoice | quote | team_invite | work_order_submitted | payment_receipt`. NULL field = use built-in default. Migrations `20260611000001` + `20260618120000` (adds payment_receipt to the CHECK).
- Engine: `src/lib/emails/templates.ts` — `EMAIL_TEMPLATE_DEFAULTS/VARIABLES/LABELS`, `renderTemplateVars` ({{var}}), `resolveEmailTemplate` (row→defaults), `getResolvedEmailTemplate(sb, bizId, type)`. Each builder (`invoice.ts`, `quote.ts`, `team-invite.ts`, `work-order-submitted.ts`, `payment-receipt.ts`) exports `…EmailVars` + `…EmailSubject` + `…EmailHtml({…, template})`, supports `custom_html` full override + section toggles (show_line_items/payment_details/buttons).
- Wired into EVERY send path: `sendInvoiceEmail`/`sendQuoteEmail` actions, scheduled-send cron, `/api/v1/agent`, MCP `send_invoice_email`/`send_quote_email`, team invites, work-order-submitted.
- Editor at `/settings/email-templates` (linked from Settings → Email): per-type editor + live preview (`previewEmailTemplate`) + reset. Server actions in `src/lib/actions/email-templates.ts`.
- MCP: `list_email_templates`, `update_email_template`, `reset_email_template`.

### Stripe Connect Standard — payments (the main work)
**Architecture:** Connect **Standard**, **direct charges** on each business's own connected account + `application_fee` to the platform. Platform account = "Kirei Business Manager" (`acct_1TjgR1DbruxScmob`). The app key, the connected account, AND the webhook must all be in the **same Stripe environment** (test/sandbox vs live) or webhook signatures fail — this caused a long debug; see traps below.
- **Env vars (Vercel, prod):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PLATFORM_FEE_PERCENT` (default 2). Currently set to **test/sandbox** keys → production runs Stripe in test mode. Going live = repeat in Stripe **Live mode** (live key + live webhook) and swap the two Vercel vars.
- **Webhook:** ONE endpoint at `https://www.kireihq.com/api/stripe/webhook`, scope **Connected accounts** (critical — charges fire on connected accounts), events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `account.updated`. `/api/stripe/{webhook,checkout,save-card}` are whitelisted in `src/lib/supabase/middleware.ts`.
- **Files:** `src/lib/stripe.ts` (client + amount helpers + `DEFAULT_DEPOSIT_PERCENT` + `defaultPlatformFeePercent`), `src/lib/actions/stripe.ts` (onboarding/status/disconnect/fee/deposit + autopay actions), `src/app/api/stripe/{connect/return,connect/refresh,checkout,webhook,save-card}`.
- **Migrations:** `20260618090626` (businesses stripe_* cols + payments provider_* cols + idempotency index), `20260618130000` (businesses.deposit_percent), `20260618140000` (customers.allowed_payment_methods), `20260621100000` (customers card-on-file cols).

**Features built on top:**
- **Pay-with-card in invoice emails** — `invoiceEmailHtml` gains `payUrl`; gated on stripe_charges_enabled + balance + customer allows card.
- **Payment receipt email** — webhook → branded receipt (template type `payment_receipt`).
- **Quote deposit by card** — `businesses.deposit_percent` (default 50); portal "Accept & pay deposit" → `/api/portal/[token]/quote/[id]/accept-with-deposit` converts quote→invoice + mints a deposit child invoice → reuses checkout; `trg_reconcile_parent_invoice` rolls up.
- **Per-customer payment methods** — `customers.allowed_payment_methods` (NULL=all; explicit list=only those; 'cash' opt-in). `src/lib/payment-methods.ts` (`resolveOfferedMethods`, `customerAllowsCard`). Enforced on portal, email pay-link, checkout route (403), quote deposit.
- **Card on file + autopay (recurring)** — `customers.stripe_customer_id/stripe_payment_method_id/stripe_pm_brand/last4/exp/autopay_enabled`. Save-card = `/api/stripe/save-card` (hosted SetupIntent Checkout on connected acct) → webhook `checkout.session.completed` mode=setup stores PM + enables autopay. **Off-session charge engine** `src/lib/stripe-charge.ts` (`chargeInvoiceToSavedCard`) — confirmed PaymentIntent off_session + application_fee; SCA/decline → typed failure → fall back to emailed pay link. **Shared recorder** `src/lib/stripe-payments.ts` (`recordStripePayment`, idempotent on `(business_id, provider_payment_id)`) used by BOTH the webhook and the inline autopay record — so autopay needs no extra webhook event. `sendInvoiceEmail` auto-charges autopay customers (skips dunning email on success). "Charge saved card" button on invoice detail. Actions: `chargeSavedCardNow`, `setCustomerAutopay`, `removeSavedCard` (detaches PM), `getSaveCardLink`. MCP: `get_save_card_link`, `set_customer_autopay`, `charge_saved_card`, `get_stripe_status`, `create_stripe_payment_link`.

- **Card surcharge (pass the card fee to the customer)** — `businesses.card_surcharge_enabled/percent/fixed/note` (migration `20260622100000`). Helpers `computeSurcharge`/`surchargeNote` in `src/lib/stripe.ts`. Added as a separate "Card processing fee" line at checkout + on autopay charges; the invoice is credited the FACE amount via `kirei_amount` session/PI metadata (webhook reads it so the surcharge doesn't over-pay the invoice). Portal shows the note + "Pay $X with card (incl. $Y fee)". Settings → Payment UI carries a compliance warning (surcharging is regulated/banned in some regions). MCP: `update_settings` gains `card_surcharge_*`. Actions: `setCardSurcharge`.

**LIVE — Stripe is in production (live mode) as of June 2026.** Vercel prod `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are LIVE keys; ONE live webhook endpoint (Connected accounts scope, 3 events). **Going live required completing the Stripe Connect platform profile in live mode** (dashboard.stripe.com/settings/connect/platform-profile) — until that's done, `accounts.create` throws "You must complete your platform profile to create accounts" (surfaced as a 500/"Server Components render error" on Connect). When switching environments, the stored test `stripe_account_id` (businesses) + saved-card fields (customers) are invalid → cleared via SQL so businesses re-Connect + customers re-save cards fresh in live. Test connected account was Connected Studio (`acct_1TkIRwRjVLrcP1Im`, test).

**Stripe MCP:** a Stripe MCP connector is available in-session (tools `mcp__…__stripe_api_*`, `get_stripe_account_info`) but it authed to a DIFFERENT environment than the app's keys (couldn't see the connected account / GetAccounts empty), so it can't inspect the app's sandbox. Verify payments via the **Supabase DB** (`payments` where `provider='stripe'`) and **Vercel runtime logs** (`/api/stripe/webhook` status) instead.

**Verified working (test mode):** Connect onboarding, one-off card payment (invoice→paid), receipt email, platform fee capture (`provider_platform_fee`). `provider_fee` (Stripe processing fee, the connected account's cost) can be null at webhook time — best-effort. Autopay built + shipped, not yet user-tested end-to-end.

### Automatic recurring billing (shipped after autopay)
- **Recurring invoices (subscriptions):** `recurring_invoices` table (migration `20260621160000`) + `src/lib/actions/recurring-invoices.ts` (CRUD + `runRecurringInvoiceNow`) + cron `/api/cron/recurring-invoices` (daily 06:00 UTC, in vercel.json) + UI `/recurring-invoices` (sidebar "Recurring billing") + MCP (`list_recurring_invoices`, `create_recurring_invoice`, `set_recurring_invoice_active`, `run_recurring_invoice_now`). Each cycle it generates an invoice from saved line items and auto-charges the saved card off-session (else emails a pay link).
- **Auto-bill recurring jobs:** `recurring_jobs` gained `auto_invoice` + `invoice_line_items` + `auto_charge`; the recurring-jobs cron generates + auto-charges an invoice when a job materialises. Form has a billing section.
- **Shared generator** `src/lib/recurring/generate-invoice.ts` — mints invoice numbers MANUALLY (the `next_invoice_number` RPC checks `auth.uid()`, null for the service-role client), then auto-charges via `stripe-charge` or emails via `invoiceEmailHtml`. Totals helper in `src/lib/recurring/totals.ts` (kept out of the `"use server"` actions file — sync exports break those at build).

### Customer contracts + NATIVE e-signature (shipped — PR #336, branch `feat/contracts`, NOT yet merged)
- **Tables** (migration `20260623100000_contracts.sql`, applied + recorded on remote): `contract_templates` (reusable bodies) + `contracts` (id, business_id, user_id, customer_id, title, `kind` `rich_text`|`pdf`, content_html, source_path, `status` draft/sent/viewed/signed/declined/voided, signer_name/email, provider, signed_path, sent/viewed/signed_at, audit jsonb). RLS: members non-worker read, owner/admin/editor write. Private `contracts` storage bucket (source PDF + drawn-signature PNG + generated signed PDF; served via signed URLs / token-gated routes).
- **Authoring two ways:** rich-text with merge fields (`{{customer_name}}` etc. — list in `src/lib/contracts/merge-fields.ts`, kept OUT of the `"use server"` actions file or it breaks the build) or uploaded PDF. Reusable templates.
- **E-signature is NATIVE / free — NO third party.** User explicitly rejected Dropbox Sign (paid). Flow: `sendContractForSignature` (action) / `send_contract` (MCP) mints/reuses a `customer_portal_tokens` row and emails the customer a link to `/portal/[token]/contract/[id]`. The customer types **or** draws a signature (canvas) + ticks consent → POST `/api/portal/[token]/contract/[id]/sign` (admin client, token-validated). That route captures name + method + IP + user-agent into `audit` jsonb, stores the drawn PNG, **generates a signed PDF via `@react-pdf` (`src/components/contracts/contract-pdf-document.tsx`)** with a signature certificate page, uploads it to `signed_path`, and flips status to `signed`. Legally valid under ESIGN/UETA/ETA (intent + audit trail).
- **Actions** `src/lib/actions/contracts.ts`: templates + contracts CRUD (draft-only edit), `uploadContractPdf`, `getContractPdfUrl` (signed URL), `renderContractHtml` (merge-field fill), `getContractSignLink`, `sendContractForSignature`, `isSigningEnabled` (now always true). Shared plain helpers in `src/lib/contracts/render.ts` (`fillMergeFields`, `htmlToParagraphs`) — used by the portal page + sign route (no "use server").
- **Routes:** portal page `/portal/[token]/contract/[id]` + sign API `/api/portal/[token]/contract/[id]/sign` (both public via the existing `/portal/`+`/api/portal/` middleware whitelist — no new entry needed). Signed PDF served at `/api/pdf/contract/[id]?token=`, original at `/api/pdf/contract/[id]/source?token=` (token or authed user).
- **Surfaces:** `/contracts` (list + create modal), `/contracts/[id]` (preview/edit, **Send to sign**/**Resend**, **Copy link**, void/delete/download signed). Sidebar "Contracts" under Sales. MCP: `list_contracts`, `get_contract`, `create_contract`, `update_contract`, `send_contract`, `void_contract`, `delete_contract`, `list_contract_templates`, `create_contract_template` (scopes `contracts:read`/`contracts:write`).
- **No setup required** — signing works out of the box. (The earlier Dropbox Sign integration + its webhook were removed.)

### Not yet done / parked
- **App Store submission** (iOS): mid-flight on App Store Connect for "Kirei Business Manager" (ASC App ID `6773209964`, bundle `com.kireihq.app`, build 5). Metadata/build/age-rating(4+)/pricing(free, 175 territories)/privacy-policy-URL filled; **demo account created** (`apple.review@kireihq.com` / `AppleReview2026!`, biz "Kirei Demo Services" seeded via SQL). STILL NEEDS: screenshots (1290×2796), App Privacy data-collection answers, accept Developer Program License Agreement, then "Add for Review". The browser tools BLOCK the Stripe dashboard (financial site) but App Store Connect was driveable via Chrome MCP. **Do NOT click "Add for Review" without explicit per-action user confirmation.**
- **Customer contracts + e-signature:** NEXT FEATURE (requested). Build contracts a business can create for a customer and the customer can sign (portal). Not started — design from scratch.
- ~~Recurring auto-INVOICING~~ — DONE (recurring invoices + auto-bill recurring jobs shipped; see "Automatic recurring billing" above; full MCP coverage incl. create/update/delete for both).
- ~~Go live on Stripe~~ — DONE (live in production).

### Traps learned this session
- **Stripe env consistency** — app `STRIPE_SECRET_KEY`, the connected account, and the webhook endpoint must all be in the SAME Stripe environment (sandbox vs test vs live). A duplicate/idle webhook endpoint (0 deliveries) whose secret was copied caused persistent webhook 400s ("No signatures found matching"). Fix: ONE endpoint, copy ITS signing secret, same env as the keys.
- **Vercel env changes need a redeploy** to take effect; updating a var alone does nothing to the running deployment.
- **`"use server"` files may only export async functions** — a `export const` in `src/lib/actions/stripe.ts` broke ALL its exports at build (moved the const to `src/lib/stripe.ts`).
- **Vercel `invoicer` project = kireihq.com** (the Vercel project is named "invoicer", branded Kirei). Env vars go on that project.
- **Browser tools block the Stripe dashboard** (financial site) — can't automate it; guide the user click-by-click.
- **Stripe webhook signature** needs the raw body — handled by `await request.text()` in the route handler (don't add body parsing/middleware that consumes it).
- **Live Connect needs the platform profile completed** — creating connected accounts in live mode fails ("You must complete your platform profile") until the Connect platform profile is filled in the live dashboard. Test/sandbox skips it.
- **Switching Stripe env invalidates stored ids** — test `stripe_account_id` / saved-card ids don't exist in live (and vice-versa); clear them so businesses re-Connect + customers re-save cleanly.
- **Surcharge ≠ invoice amount** — when a card surcharge is added, the charge total > invoice balance; record the invoice payment as the FACE amount (passed in `kirei_amount` metadata) so `amount_paid` isn't overstated.

---

## Session log (late May 2026) — store launch, MCP, email agent, design system

(Superseded by the June 2026 log above — kept for history.)

### Mobile published to the stores (EAS)
- **EAS project linked:** `@tim90six/kirei`, `projectId` in `mobile/app.json`. Expo account `tim90six` (m.altamimi96@outlook.com). Drive EAS non-interactively with `EXPO_TOKEN` (create at expo.dev/settings/access-tokens) — `eas login` itself can't be automated.
- **iOS: live on TestFlight.** Apple Team `474LBTA57F` (Individual). Distribution cert + provisioning profile created via `eas credentials`. App Store Connect app **"Kirei: Trades Manager"** (the plain name "Kirei" was taken — store name differs from the on-device name, which stays "Kirei"), **ASC App ID `6772754750`**, bundle `com.crownroofers.connectedhub`.
- **Submit is non-interactive via an App Store Connect API key:** `mobile/asc-key.p8` (gitignored — `*.p8`), Key ID `G7R8967FYN`, Issuer ID in `eas.json`. `eas.json` submit.production.ios is fully filled, so `eas submit --platform ios --latest` just works.
- **Android: `.aab` built**, not yet uploaded. First Play release must be uploaded **manually** in the Play Console (Google requires the first release + app entry by hand; `eas submit` works for every release after). Play accepts the name "Kirei".
- **EAS build gotchas (each cost a failed build):**
  - `mobile/.npmrc` with `legacy-peer-deps=true` is **required** — EAS Build runs a plain `npm install` that ERESOLVE-fails this repo's peer graph otherwise (16-second build death).
  - Deps must match SDK 54 (`expo-linear-gradient ~15.0.8`, `expo-asset ~12.0.13`, etc.) — run `npx expo-doctor` before building. The repo nests `mobile/` inside the web repo, so `mobile/metro.config.js` pins `nodeModulesPaths` to mobile's own node_modules (else Metro grabs the web app's React). The lingering "duplicate react at ../node_modules" doctor warning is the web copy outside `mobile/` — harmless, EAS builds `mobile/` in isolation.
  - iOS encryption compliance is pre-answered via `ITSAppUsesNonExemptEncryption: false` in app.json infoPlist.
  - **No OTA updates** — `expo-updates` isn't installed, so every JS fix needs a full rebuild + resubmit to reach testers. (Candidate: add `expo-updates` + `eas update` for instant beta fixes.)
- **Store assets:** public **`/privacy`** and **`/support`** pages on kireihq.com (whitelisted in middleware; privacy URL is mandatory for both stores). Paste-ready listing copy + Apple App Privacy / Play Data Safety answers in `mobile/STORE_LISTING.md`.
- **TestFlight distribution:** Internal testing has no review (testers must be added under Users & Access). External testing needs Beta App Review before the public link works. For a few people, use Internal.

### Per-business email sender
`buildBusinessFrom({ name, localPart })` in `src/lib/email.ts` — every outbound email is `"Business Name <localpart@<slug>.kireihq.com>"` with Reply-To = the business email. `KIREI_FROM_STRATEGY` env: `subdomain` (default, needs `*.kireihq.com` verified) or `local` (`<slug>@kireihq.com`, root domain only). **Production is set to `local`.** Wired into invoice/quote/team/work-order sends + the scheduled-send cron. DNS for kireihq.com is verified — sends work (confirmed via a live `email_events` row).

### Email agent now creates tasks (not just leads)
`/api/cron/email-leads` classifies each email for **action items** too (send quote / reply / fix invoice / call X) and creates kanban tasks, deduped by `tasks.source_message_id` (migration `20260522184355`, partial unique index). Scheduling moved **from GitHub Actions to Vercel Cron** (`vercel.json`, `*/30`) because GitHub's scheduler was silently skipping runs. The route gates cadence by **Sydney local time** (`Australia/Sydney`): twice/hour 6am–8pm, every 2h overnight; off-cadence ticks early-return. `?force=1` bypasses the gate (manual GH `workflow_dispatch`).

### Deposit / progress-invoice fix
A paid deposit (child invoice, `parent_invoice_id`) now correctly deducts from the parent. DB trigger `trg_reconcile_parent_invoice` (migration `20260522183034`) recomputes the parent's `amount_paid` + status whenever any child changes — works no matter how the child was paid (record-payment, status dropdown, MCP). "Mark paid" paths now also set `amount_paid = total`. Backfilled existing parents.

### Team / worker fixes
- **`addMember` now always creates a `member_profiles` row** (not just `business_members`) — an access-level add used to leave a member with no workforce profile (not job-assignable, not link-able). Upserts on `(business_id, email)`; throws if the profile can't be created.
- **Mobile role resolution fails closed:** `fetchRoleForBusiness` (`mobile/src/lib/active-business.ts`) returns `worker` (most restricted) on empty/error instead of `viewer`, and `useActiveBusiness` starts at `worker`. Previously a worker whose role didn't resolve (pending status / no profile / transient error) was shown the full owner dashboard, because the app only locks down `role === 'worker'` and treats viewer/editor/admin as full-access.

### Web Kirei design reskin
The web app was reskinned to match the mobile look — primitives under `src/components/ui/kirei/` (GradientTile, StatTile, CardListRow, KireiAvatar, KireiPill, KireiTabs, EmptyState, Skeleton, FadeIn, AnimatedPress, DetailHero, FactCard, FormSection). List pages use card-lists with `break-words` (not `truncate` — user wants text to wrap, not clip, on mobile). `PageHeader` has a gradient accent rail.

---

## Recent session log (May 2026)

What landed in the most recent multi-day push, grouped so the next session can pick up where this left off:

### Mobile
- **Rebrand to Kirei** — app name, scheme (`kirei://`), login title, logo (stylised K with diagonal slash on teal gradient, generated via the script at `/tmp/kirei-icons.js` using `sharp` from root deps). Bundle IDs unchanged (`com.crownroofers.connectedhub`) so TestFlight credentials don't reset.
- **Tablet + landscape** — `mobile/src/lib/responsive.ts` `useResponsive()`; dashboard grid 2/3/4 cols; detail screens capped at 820px; orientation `default`.
- **Dark mode** — full theme system in `mobile/src/lib/theme.ts` + `theme-provider.tsx`. System / Light / Dark picker on `/settings/appearance`. Dark palette: canvas `#0c0d0f`, card `#181a1d`, primary lifted to `#4ea69e`.
- **Visual refresh** — gradient palette, animated press feedback, fade-in stagger, confetti on invoice→paid, branded refresh control, gradient tab bar with haptics, skeleton placeholders, animated KPI counters, gradient empty states. All under `mobile/src/components/`.
- **Performance** — FlatList windowing + `.limit(100)` across all mobile lists.
- **EAS Build / Submit set up** — `mobile/app.json` + `mobile/eas.json` + `mobile/DEPLOY.md` walkthrough. Icons in `mobile/assets/`.

### Web
- **Performance overhaul** — see "Performance & caching" section above.
- **Team management moved off Settings** — `/team` page now hosts both the workforce profiles (skills/bio/avatar) AND the access-level management (add member by email, change role, copy invite link, remove). `TeamSettings` component reused from settings. Settings → Team tab removed.
- **Quoting Agent** — see dedicated section above. Migration `20260512030000_quoting_agent.sql` applied to remote.
- **Lead detail page** at `/leads/[id]` (was 404 from the dashboard New Leads widget).
- **Work-order new form** prefills property address from selected customer if customer has no sites (fetches the address columns now, falls back from sites to customer.address chain).
- **AI agent live context** + **cross-turn memory** with persisted tool history — both web and mobile.

### Database migrations applied this session (remote up-to-date)
- `20260510232842_progress_invoice_parent_rollup_backfill.sql`
- `20260511020000_perf_indexes.sql`
- `20260511020100_perf_atomic_number_mint.sql`
- `20260512000001_workers_can_see_job_customers.sql`
- `20260512030000_quoting_agent.sql`

### Open / deferred (next session candidates)
- **TestFlight / Play store actual submission** — config is done but the user hit Apple Developer enrolment friction. EAS commands ready in `mobile/DEPLOY.md`.
- **Push notification triggers** — local 9am morning briefing works; server-side push (Expo Push API) needs EAS credentials + cron wiring.
- **Mobile parity** — see matrix in `docs/MOBILE_PARITY_PLAN.md`. Remaining: offline-first cache, native voice TTS for agent replies, work-order portfolio editor is in place but the customer-properties (sites) editor is read-only.
- **Quoting Agent tool surface could grow** — currently 9 tools, mostly knowledge-bank + quote-creation. Adding image inputs (scan a tradie's hand-written estimate, build a quote from it) is the obvious next step.
- **Agent could read photos / attachments** — both web and quoting agents are text-only on the input side.

## Mobile parity policy (May 2026)
Connected Hub mobile app (`mobile/`) is being levelled up to full feature parity with the web. See `docs/MOBILE_PARITY_PLAN.md` for the canonical matrix and phased rollout.

**For every web change you make, you must:**
1. Update the matrix in `docs/MOBILE_PARITY_PLAN.md` (flip status, add row).
2. Open a paired mobile PR — or note in the web PR which mobile phase the change lands in.
3. Mirror new shared types/permissions from `src/types/database.ts` and `src/lib/permissions.ts` into `mobile/lib`.

QA checklist (`docs/QA_CHECKLIST.md`) gets matching mobile checkboxes as features roll out per phase.
