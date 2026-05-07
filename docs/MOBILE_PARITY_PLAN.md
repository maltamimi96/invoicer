# Mobile Feature Parity Plan

**Goal:** Connected Hub becomes the full Kirei experience on mobile — same features as the web app, with role-aware access (owner > admin > editor > worker > viewer).

This document is the canonical roadmap. Every web feature shipped from now on must also ship on mobile (or have a tracked exception with rationale). Update the matrix below in the same PR that changes web behaviour.

---

## Where we are today (May 2026)

### Mobile (Connected Hub) — currently a worker-only app
- ✅ Auth — login + signup with invite code
- ✅ Dashboard — today's jobs (worker-flavoured)
- ✅ Tasks — kanban-lite (mobile)
- ✅ Schedule — list of upcoming jobs
- ✅ Profile / settings — basic
- ✅ Job detail — booker/onsite contacts, native maps, photo gallery, status changes
- ❌ Everything else (see matrix below)

### Web (Kirei)
- 25+ pages, ~200 server actions, full multi-tenant with RBAC

---

## Architecture for parity

### Auth + tenancy
- **Same Supabase backend.** Mobile signs into the same auth.users → same business_members → RLS handles the rest. No duplicate user system.
- **Multi-business switcher** mirrors web — list of businesses the user is a member of, store the active one in AsyncStorage.

### Role-based navigation
Mobile bottom-tab bar adapts to the caller's role in the active business. Same role helpers (`canEdit`, `canManageTeam`, `isOwner`, `isWorker`) are mirrored in mobile to match `lib/permissions.ts` exactly.

| Role | Tabs visible |
|---|---|
| Owner / Admin | Dashboard · Sales · Service · Customers · Assistant · Profile |
| Editor | Same minus Settings/Team |
| Viewer | Read-only versions |
| Worker | Dashboard · Jobs · Schedule · Tasks · Profile |

Sub-pages reachable via stack navigation off each tab.

### Data layer
Mobile calls server actions via `supabase.rpc()` or directly via Supabase queries (RLS enforces tenancy). Heavy lifting (briefing engine, AI agent, PDF render) stays server-side and is invoked the same way.

### Shared code with web
- Type definitions (`types/database.ts`) — copy via build step or symlink
- Permissions helpers (`lib/permissions.ts`) — mirror exactly
- Country/address formats (`lib/country-formats.ts`) — mirror exactly

### Mobile-only adjustments
- Native voice via `expo-speech-recognition` (replaces Web Speech API) — already wired for the agent panel via Whisper fallback
- Share via `expo-sharing` (native share sheet, replaces clipboard-only)
- Push notifications via `expo-notifications` (briefing alerts, new lead pings)
- Click-to-call uses `Linking.openURL("tel:...")` — already done
- Camera direct-capture in photo flows
- File downloads use `expo-file-system` for PDFs

---

## Feature parity matrix

Status legend: ✅ done · 🟡 partial · ❌ missing · 🚫 not applicable on mobile

| Web feature | Mobile status | Phase | Notes |
|---|---|---|---|
| **Auth** |
| Login | ✅ | shipped | |
| Signup with invite code | ✅ | shipped | |
| Forgot password | ✅ | 2f | Sends Supabase recovery email; reset link opens on web |
| **Foundation** |
| Multi-business switcher | ✅ | 1 | AsyncStorage-backed, sits above the index tab |
| Active business sync | ✅ | 1 | useActiveBusiness hook |
| Role-aware navigation | ✅ | 1 | Index tab branches: OwnerDashboard vs WorkerJobsList |
| Mirrored permissions | ✅ | 1 | mobile/src/lib/permissions.ts |
| **Dashboard** |
| Owner dashboard (KPIs, overdue strip, leads strip) | ✅ | 1 | |
| Owner dashboard (briefing widget) | ✅ | 1.5 | Inline supabase queries; snooze deferred to phase 2 |
| Owner dashboard (tasks widget) | ✅ | 1.5 | Top 6 open tasks, one-tap complete |
| Owner dashboard (outlook widget) | ✅ | 1.5 | Team / recurring / agents counts |
| Worker dashboard | ✅ | shipped | |
| Briefing widget | ❌ | 1 | Mobile version of `/assistant` |
| Header bell briefing | ❌ | 1 | Top-bar icon with unread count |
| New leads widget | ❌ | 2 | |
| Sales tab (hub menu) | ✅ | 2a | Owner-only, 4 cards: Leads/Customers/Quotes/Invoices |
| **Sales** |
| Leads list (search + status filters + tap-to-call/email) | ✅ | 2a | |
| Lead detail (status changer + quick contact) | ✅ | 2a | |
| Add lead (with custom source) | ✅ | 2c | |
| Convert lead → customer | ✅ | 2d | UserCheck button on lead detail; mints customer + marks lead won |
| Convert lead → quote/work-order | ❌ | 3 | Defer with quote/WO creators |
| Convert quote → invoice | ✅ | 2d | FileCheck button on quote detail; mints invoice number, copies line items |
| Quotes list + detail | ❌ | 2 | |
| New quote (with line items) | ✅ | 2f | LineItemsEditor + CustomerPicker; mints number from prefix counter |
| Send quote email/SMS | ❌ | 2 | |
| Duplicate quote | ❌ | 2 | |
| Convert quote → invoice (matrix anchor) | ✅ | 2d | See above |
| Invoices list + detail | ❌ | 2 | |
| New invoice | ✅ | 2f | LineItemsEditor + CustomerPicker; due defaults to issue + 14d |
| Send invoice email/SMS | ❌ | 2 | |
| Record payment | ❌ | 2 | |
| Deposit / progress invoice | ❌ | 3 | More complex, defer |
| Send remainder | ❌ | 3 | |
| Duplicate invoice | ❌ | 2 | |
| Reset to draft | ❌ | 2 | |
| Smart Fill (paste → form) | ❌ | 3 | Hits same `/api/ai` endpoint |
| **Service** |
| Work orders list | 🟡 | 1 | Worker sees only theirs; owner sees all |
| Work order detail (full portfolio) | 🟡 | 1 | Has basics; need: Workers picker, financials, share link |
| Site reports list | ✅ | 3 | |
| Site report detail (sections, photos, PDF, share) | ✅ | 3 | |
| New site report (AI generated) | ❌ | 3+ | Defer — AI generator is heavy lift |
| Recurring jobs (list + activate toggle) | ✅ | 3 | |
| **Contacts** |
| Customers list (search + tap-to-call/email) | ✅ | 2a | |
| Customer detail (counts, contact actions, address) | ✅ | 2a | |
| Add customer (with per-country addresses) | ❌ | 2b | Mirror AddressFields |
| Customer hub link button | ✅ | 2d | Native share sheet — mints/reuses 90-day portal token |
| Customer properties (sites) | ❌ | 2b | |
| **Catalog** |
| Products list + add/edit | ❌ | 3 | |
| **Workforce** |
| Team profiles list | ❌ | 4 | |
| Add team member (sends invite) | ❌ | 4 | |
| Agents on/off | ✅ | 4 | List + toggle per agent |
| **Insights** |
| Analytics page (KPIs, range pills) | ✅ | 4 | Charts via victory-native — phase 4+ |
| **Workspace** |
| Tasks (kanban) | 🟡 | shipped (basic) | Polish: drag-drop on mobile, link to job |
| Messages (SMS inbox) | ❌ | 4 | Inbound replies |
| Assistant page | ❌ | 1 | Briefing list |
| AI agent chat | ❌ | 4 | Native voice |
| **Settings** |
| Business profile | ✅ | 2d | Name, contact, ABN, currency, address — owner/admin only |
| Bank details | ❌ | 4 | |
| Team management | ❌ | 4 | |
| API keys | ❌ | 5 | Power-user only |
| Webhooks | ❌ | 5 | Power-user only |
| Email config | ❌ | 5 | Power-user only |
| Appearance / personalisation | ❌ | 5 | |
| **Cross-cutting** |
| Smart Organise (cleanup) | ❌ | 5 | |
| Share links (WhatsApp/SMS/Email) | ❌ | 2 | Native share sheet |
| Schedule send (later) | ❌ | 2 | |
| Email delivery tracking | 🚫 | — | View-only on web is enough |
| Customer portal | 🚫 | — | Customer-facing, not the tradie's app |
| **Mobile-native bonuses** |
| Push notifications | ❌ | 4 | Briefing alerts, new leads |
| Offline-first (jobs / photos) | ❌ | 5 | Power feature |
| Camera direct-capture for invoices | ❌ | 3 | Tap → photo → AI line items |

---

## Phased rollout

Each phase is independently shippable — owner gets value at every step.

### Phase 1 — Foundation (~1 week)
**Goal:** Owner can log in on mobile and see their business with proper navigation.

- Multi-business switcher (top-left, mirrors web)
- Role-aware tab bar (worker tabs vs owner tabs)
- Owner dashboard skeleton: KPI strip, briefing widget, today's schedule
- Briefing list page (`/assistant` equivalent)
- Header bell with unread count
- Settings → Business basics (name, contact, currency)
- Forgot-password deep link
- **Mirror docs**: copy `lib/permissions.ts` and `types/database.ts` into `mobile/lib`

### Phase 2 — Sales (~1.5 weeks)
**Goal:** Owner can run sales end-to-end from their phone.

- Leads: list, detail, add with custom source, convert
- Quotes: list, detail, new, line items, send email/SMS, duplicate, convert
- Invoices: list, detail, new, line items, send email/SMS, record payment, duplicate, reset to draft
- Customers: list, detail, add, properties
- Share-link dialog (native share sheet — WhatsApp / SMS / mail)
- New-leads dashboard widget
- Schedule send

### Phase 3 — Service (~1 week)
**Goal:** Field-ops parity.

- Work order detail: workers picker, financials, share link
- Site reports: list, new (AI), detail, PDF download
- Recurring jobs
- Deposit / progress invoice
- Send remainder
- Smart Fill in invoice/quote
- Camera direct-capture flow

### Phase 4 — Insights + AI (~1 week)
**Goal:** Mobile becomes a real-time intel tool.

- Analytics page
- AI agent chat (with native voice)
- Messages (SMS inbox)
- Team management
- Agents on/off
- Push notifications

### Phase 5 — Admin polish (~3-5 days)
- Bank settings
- API keys / webhooks (power-user)
- Email config
- Appearance settings
- Smart Organise across entities
- Offline-first job + photo cache

---

## Going-forward policy

**Every PR that adds or modifies a web feature must:**
1. Update the matrix in this doc — flip status / add row.
2. Open a paired mobile PR or document why it's deferred (with the phase it lands in).
3. Mirror any new shared types or permission helpers from `src/types/database.ts` and `src/lib/permissions.ts` into `mobile/lib`.

**The QA checklist (`docs/QA_CHECKLIST.md`) gets matching mobile checkboxes** as features roll out.

---

## Recommended start

Phase 1, this week. I can ship the multi-business switcher + role-aware tabs + owner dashboard skeleton + mirrored permissions in the first PR — that's enough scaffolding to make every subsequent feature plug-in trivially.

Sign-off needed before I start so we can scope each phase before committing.
