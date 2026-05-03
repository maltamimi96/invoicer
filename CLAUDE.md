# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Invoicer is a multi-business field-services SaaS — a hybrid of ServiceM8 (jobs, scheduling, photo-driven submissions) and GoHighLevel (CRM, leads, automations). Production runs at `invoicer.crownroofers.com.au` for Crown Roofers. A companion React Native app (`mobile/`, "Connected Hub") gives field workers a stripped-down view of just their assigned jobs.

## Commands

Web app (root):

```bash
npm run dev      # Next dev server on :3000 (Turbopack)
npm run build    # Production build — runs tsc across the repo, see "Excluded paths" below
npm run lint     # next lint
npx tsc --noEmit # Standalone typecheck — what production build runs
```

Mobile app (`mobile/`):

```bash
cd mobile
npx expo start --tunnel   # Tunnel build — works over cellular via ngrok
npx expo start --lan      # LAN build — phone must share wifi
```

Mobile reads `.env` (copy from `.env.example`). Use the same `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as the web app's `.env.local`.

Database migrations (Supabase CLI is linked to project `huwlasrvbtbyxvmmfpwm`):

```bash
supabase db push                                          # apply pending migrations
supabase db query --linked --file <path-to-migration>     # one-off SQL execution (preferred when the migrations table has drifted)
supabase migration list                                   # local vs remote diff
```

After a one-off `db query` apply, record it in the tracking table:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('YYYYMMDDHHMMSS', 'description')
ON CONFLICT (version) DO NOTHING;
```

Vercel:

```bash
vercel logs                       # tail prod logs (errors land as serverless 500s with Postgres codes)
vercel ls                         # latest deployment statuses
vercel env pull --environment=production --yes /tmp/env  # check what's set
```

## Big-picture architecture

### Multi-tenancy via `business_id` + RLS

Every business-data row carries `business_id`. RLS is the **only** security gate — server actions don't filter by user, they just query. Two helpers carry the load:

- `src/lib/active-business.ts` — `getActiveBizId(supabase, userId)` reads from the `active_business_id` cookie (RLS catches cookie tampering at query time)
- `src/lib/supabase/server.ts` — Supabase server client wired to Next cookies via `@supabase/ssr`

A user can own multiple businesses (`businesses.user_id`) AND be a member of others (`business_members`). The `BusinessSwitcher` in the sidebar flips the cookie.

### Roles

`src/lib/permissions.ts` defines the role union: `'owner' | 'admin' | 'editor' | 'viewer' | 'worker'`. Owner is derived from `businesses.user_id` and never stored in `business_members`. Worker is a hard-isolation role — they only ever see the work orders assigned to them. Helpers: `canEdit`, `canManageTeam`, `canManageSettings`, `isOwner`, `isWorker`, `canSeeFinancials`, `isPathAllowedForWorker`.

The worker isolation lives in the database — `is_business_worker(biz_id)`, `my_member_profile_ids(biz_id)` SECURITY DEFINER helpers are used by RLS policies on every sensitive table to deny worker access. Adding a new business-data table? Mirror the existing pattern (`<table>_no_workers` policy) or workers will see it.

### Server actions are the API

`src/lib/actions/*.ts` is the entire API surface. Every file is `"use server"`, exposes flat-scalar-arg functions, and is **AI-tool-first** — designed to be invokable by an AI assistant or voice prompt, not just clicked through a form. When adding a feature: write the server action first, then UI on top.

Conventions in actions:
- Always `await createClient()` then `supabase.auth.getUser()` and throw on missing user
- Always resolve `businessId` via `getActiveBizId(supabase, user.id)` — don't trust client-passed business ids
- Coerce empty strings to `null` for UUID/date columns; Postgres rejects `""` with `22P02`. The pattern `const uid = (v) => UUID_RE.test(v?.trim() ?? '') ? v.trim() : null;` is used in `work-orders.ts`
- After mutations, `revalidatePath()` the affected page
- For new columns: write the migration in `supabase/migrations/`, apply via `supabase db query --linked --file`, then update `src/types/database.ts`

### Mobile app talks to the same Postgres

`mobile/` is an Expo SDK 54 app using expo-router. It uses `@supabase/supabase-js` directly with the worker's session — RLS does the filtering, so there's no separate API to maintain. Photos go to the `work-order-photos` Supabase Storage bucket; the bucket policy requires the path's first segment to equal `auth.uid()::text`.

The mobile app calls `link_my_member_profile()` on every sign-in so a worker who never visits the web still gets their existing `member_profiles` row linked to their auth user (otherwise RLS would hide everything).

### Web routing

- `src/app/(dashboard)/layout.tsx` — auth gate, business resolution, role detection, `link_my_member_profile()` call, worker path-redirect
- `src/proxy.ts` — Next 16 renamed `middleware.ts` to `proxy.ts`. Forwards `x-pathname` so server components can route by URL
- `src/components/layout/dashboard-shell.tsx` — single `<main>` wrapper with `max-w-7xl mx-auto w-full p-5 sm:p-6 lg:p-8`. Pages should NOT add their own `max-w-*` outer wrappers — that was the cause of the inconsistent sizing fixed in PR #173

### PDF & email

- PDFs (`@react-pdf/renderer`): listed in `next.config.ts` under `serverExternalPackages` so it bundles correctly. Templates live at `src/components/invoice-pdf.tsx`, `quote-pdf.tsx`, etc.
- Email (`src/lib/email.ts`): wraps Resend. `RESEND_FROM_EMAIL` is `Crown Roofers <invoices@crownroofers.com.au>` (domain verified). Email failures are caught silently in some flows — be careful when extending; surface errors when the feature is user-blocking.
- Email is Vercel cron-driven for inbox scans (`.github/workflows/email-leads.yml` and `src/app/api/cron/`).

### Theme

The active theme is set via `<html data-theme="console">` in `src/app/layout.tsx`. The CSS variables under `[data-theme="console"]` in `src/app/globals.css` are the **flux-style** palette: cream-lime (`#eaf0c8`) canvas, white cards, large radius (1rem), lime + lavender accents. Card defaults to `rounded-2xl`, Button defaults to `rounded-full` pill — overriding these breaks the whole app's visual language.

`.font-display` (Fraunces serif) is wired globally for big numerals + headlines.

### Excluded paths

`tsconfig.json` excludes `mobile/` from the Next typecheck and `.vercelignore` excludes it from the Vercel upload. Without that exclusion, the prod build fails because `expo-router` etc. aren't in the root `node_modules`.

## Working flow

- Branch per change (`feat/...`, `fix/...`, `chore/...`); squash-merge to `main`
- After merge, Vercel auto-redeploys production
- For DB changes: ship the migration in the same PR + apply to remote via `supabase db query --linked --file <path>` before merging
- Preview deploys exist; production won't update until the build is green

## Known traps

- **Don't `.catch()` on a Supabase query builder** — `PostgrestFilterBuilder` is thenable but doesn't expose `.catch()`. Use `try/catch` around `await`. Production crashed once because of this (PR #178)
- **Empty strings to UUID columns** — always coerce. The new-WO crash (PR #172) was a worker name being passed into the `assigned_to` UUID column
- **`NEXT_PUBLIC_APP_URL`** must be set on Vercel or invite emails contain `localhost` links
- **Don't add per-page `max-w-*` wrappers** — the layout shell handles content width
- **Resend domain verification** — `crownroofers.com.au` is verified for sending. If you change `RESEND_FROM_EMAIL`, the new domain must also be verified or every send fails silently
