# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Invoicer is a multi-business field-services SaaS — a hybrid of ServiceM8 (jobs, scheduling, photo-driven submissions) and GoHighLevel (CRM, leads, automations). Production runs at `invoicer.crownroofers.com.au` for Crown Roofers. A companion React Native app (`mobile/`, "Connected Hub") gives field workers a stripped-down view of just their assigned jobs.

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

### Mobile app talks to the same Postgres

`mobile/` is Expo SDK 54 + expo-router using `@supabase/supabase-js` directly with the worker's session — RLS does the filtering, no separate API. Photos go to the `work-order-photos` Supabase Storage bucket; bucket policy requires the path's first segment to equal `auth.uid()::text`.

`babel.config.js` uses `react-native-worklets/plugin` (Reanimated 4 dropped its in-tree plugin). Required Reanimated 4+ since SDK 54.

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
- **Workspace** — Dashboard · Messages · Tasks
- **Sales** — Leads · Quotes · Invoices · **Site Reports** · Recurring  *(Site Reports = client-facing inspection / scope-of-work PDFs, NOT analytics)*
- **Service** — Work Orders · Schedule
- **Contacts** — Customers · Contacts
- **Catalog** — Products
- **Workforce** — Team · Agents
- **Account** — Help · Settings (footer)

Active state is a subtle bg + 2px teal left-rail (spring-animated via `layoutId="sidebar-active-rail"`). Worker role hides nav items via the `worker?: boolean` flag on each item.

### Loaders & route progress

`src/components/layout/route-progress.tsx` — top-of-page 2px teal bar fires on every URL change. Mounted once in `dashboard-shell.tsx`.

`src/components/layout/app-loading.tsx` — `<AppLoadingProvider>` + `useAppLoading()` context with a single `setBusy(label | null)` API. While busy, a soft scrim + spinner pill covers the app. `BusinessSwitcher` uses this to give visual feedback during `router.refresh()`.

`src/components/ui/spinner.tsx` — `<Spinner size="xs|sm|md|lg" />`, `<LoadingRow />`, `<FetchingPill />` for inline use.

`src/app/(dashboard)/loading.tsx` — route skeleton mirroring the prototype's PageHeader + KPI strip + table shape so the canvas doesn't reflow when content streams in. Per-segment `loading.tsx` re-exports this for products / tasks / contacts / reports / recurring / team / agents / settings.

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

## Memory aids

User's accumulated preferences:
- **Voice/AI-first** — every workflow should be invocable by AI text or voice prompt; design server actions accordingly
- **Visual feedback for everything** — loading states on field-level fetches (e.g. `<AddressSelect>` "Loading addresses…"), progress bar on Smart Organise, scrim during business switch
- **Never trust empty input** — coerce, validate, soft-fail
- Current accent name: **teal**; sidebar: **light**; canvas: warm off-white. Don't revert to flux lime unless explicitly asked.
