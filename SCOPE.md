# Project Scope — ServiceM8 + GoHighLevel Hybrid

**Purpose:** This is the authoritative scope document. An agent should continuously compare the current repo state against this spec and implement whatever is missing or incomplete. Treat unchecked items as work to do. When something ships, check it off **and** add a one-line pointer to where it lives (file path or route).

**North star:** A single platform where a service business can (a) run the field-service side of operations (ServiceM8: jobs, techs, scheduling, invoicing, on-site capture) and (b) run the growth side (GoHighLevel: CRM pipelines, marketing automation, funnels, bookings, reputation, AI agents).

**Non-negotiables (apply to every feature):**
- **AI-voice-first:** every workflow must be invocable from an AI text prompt and a voice mic. Build each server action as an AI tool first, UI second.
- **Multi-business:** every table has `business_id`; every query filters by active business cookie; RLS enforced.
- **Per-business API keys:** external integrations authenticate with scoped keys — never share one global key.
- **Mobile-first** for anything a technician or customer touches.
- **Offline-tolerant** for the tech PWA (job cards, photos, signatures queue and sync).

---

## Tracking

- **Kanban board:** https://github.com/users/maltamimi96/projects/1
- **Issues:** https://github.com/maltamimi96/invoicer/issues
- **Sync script:** `scripts/sync-scope.mjs` — parses this file, creates/closes issues to match, adds new ones to the board (P0 → Up Next, else Backlog). Re-run any time this file changes: `node scripts/sync-scope.mjs`.
- **Source of truth split:** spec lives here (SCOPE.md); *what to do next* lives on the board. When you tick a box here, the next sync closes the matching issue.

## How the agent should use this file

1. On every run, re-read this file in full.
2. Diff current repo against each **Capability** section below.
3. Pick the highest-priority unchecked item (priorities: P0 → P1 → P2).
4. Before implementing, confirm the data model, server actions, routes, and AI tool signature match the spec here. If the spec is wrong or ambiguous, **update this file first**, then implement.
5. After shipping, tick the box, add a **sub-bullet** like `  - Shipped: <file paths>` (sub-bullet so the sync script keeps the title stable), and update `memory/project_overview.md` if architecture changed.
6. Never delete a section — mark deprecated items with `~~strikethrough~~` and a reason.

**Agent loop order of preference when idle:**
- Finish any partial capability (a section with some boxes ticked, others not).
- Then tackle P0 gaps.
- Then P1, then P2.

---

## Tech baseline (already in place — do not regress)

- Next.js 15 App Router, React 19, TypeScript, Tailwind v4
- Supabase (auth, Postgres, storage, RLS)
- @react-pdf/renderer v4 (server-side PDFs, built-in Helvetica)
- react-hook-form + Zod, Recharts, Framer Motion, Sonner, Radix/shadcn
- Resend (transactional + lead-inbox scanning)
- Route groups: `src/app/(dashboard)/*` protected, server actions in `src/lib/actions/*`
- Types: `src/types/database.ts`
- Currency: `business.currency` ISO code + `formatCurrency(amount, currency)` in `src/lib/utils.ts`
- Active business: httpOnly cookie `active_business_id` + `getActiveBizId()` in `src/lib/active-business.ts`
- API keys: `inv_<32 hex>`, SHA-256 hashed, scopes in `business_api_keys`. See `src/lib/api-auth.ts`.

---

## Already shipped (baseline features — verify they still work each pass)

- [x] Invoices (list, create, edit, PDF, send) — `src/app/(dashboard)/invoices/`, `src/lib/actions/invoices.ts`
- [x] Quotes — `src/app/(dashboard)/quotes/`, `src/lib/actions/quotes.ts`
- [x] Customers — `src/app/(dashboard)/customers/`, `src/lib/actions/customers.ts`
- [x] Products/services catalog — `src/app/(dashboard)/products/`, `src/lib/actions/products.ts`
- [x] Leads (inbound, email-scanned) — `src/app/(dashboard)/leads/`, `src/lib/actions/leads.ts`
- [x] Work orders / jobs — `src/app/(dashboard)/work-orders/`, `src/lib/actions/work-orders.ts`
- [x] Schedule — `src/app/(dashboard)/schedule/`, `src/lib/actions/schedule.ts`
- [x] Sites (job locations) — `src/app/(dashboard)/sites/`, `src/lib/actions/sites.ts`
- [x] Team / members — `src/app/(dashboard)/team/`, `src/lib/actions/members.ts`
- [x] Recurring jobs — `src/app/(dashboard)/recurring/`, `src/lib/actions/recurring-jobs.ts`
- [x] Messages (SMS) — `src/app/(dashboard)/messages/`, `src/lib/actions/sms.ts`
- [x] Reports (basic) — `src/app/(dashboard)/reports/`, `src/lib/actions/reports.ts`
- [x] Customer portal — `src/lib/actions/customer-portal.ts`
- [x] Customer hub — `src/lib/actions/customer-hub.ts`
- [x] Agents (AI) — `src/app/(dashboard)/agents/`, `src/lib/actions/agents.ts`
- [x] Webhooks — `src/lib/actions/webhooks.ts`
- [x] Job photos / signatures / time / materials / documents / timeline — `src/lib/actions/job-*.ts`
- [x] Per-business API keys + `/api/v1/*` endpoints
- [x] Multi-business switching
- [x] Email lead inbox scanner (daily, full-inbox, Message-ID dedupe)
- [x] Billing profiles — `src/lib/actions/billing-profiles.ts`
- [x] Contacts — `src/lib/actions/contacts.ts`

---

# Part 1 — ServiceM8 (Field Service Operations)

## 1.1 Jobs / Work Orders (core) — extend

- [x] Job CRUD, status lifecycle
- [x] **P0** Job types with per-type default checklists, default duration, default price, default forms
  - Shipped: `src/lib/actions/job-types.ts`, `src/app/(dashboard)/settings/job-types/`, `src/components/settings/job-types-client.tsx`, migration `20260426000001_job_types.sql`
- [ ] **P0** Dynamic job forms (per job-type): fields rendered in tech PWA, answers stored on the job, surfaced on PDF
- [ ] **P1** Job profitability view: labour cost (from time entries × member pay rate) + materials cost vs invoiced total → margin
- [ ] **P1** Job dependencies (this job blocked by that job)
- [ ] **P2** Job templates (one-click create a job from template with pre-filled line items, tasks, forms)

**Data:** `job_types`, `job_form_schemas`, `job_form_responses`, `member_pay_rates`
**Actions:** `src/lib/actions/job-types.ts`, `src/lib/actions/job-forms.ts`

## 1.2 Scheduling & Dispatch

- [x] Calendar/schedule view
- [ ] **P0** Drag-and-drop dispatch board (techs × time columns, jobs as cards)
- [ ] **P0** Conflict detection (tech double-booked, travel time infeasible)
- [ ] **P1** Route optimisation for a tech's day (order stops by travel time)
- [ ] **P1** Auto-dispatch rules (by skill tag, postcode zone, availability)
- [ ] **P2** Capacity heatmap (which days are over/under-booked)

**Data:** `member_skills`, `service_zones`, `travel_time_cache`

## 1.3 Tech Mobile PWA (field app)

- [ ] **P0** Dedicated `/tech` route group: mobile-optimised layout, large touch targets
- [ ] **P0** Today's jobs list (sorted by start time, with map link)
- [ ] **P0** Job detail: checklist, forms, photos, signature capture, time clock, materials picker
- [ ] **P0** Clock in / clock out per job (writes to `job_time`)
- [ ] **P0** Photo capture with category (before / during / after) + auto-upload to Supabase storage
- [ ] **P0** Customer signature (touch/stylus) → stored as job signature, embedded in PDF
- [ ] **P1** Offline queue (IndexedDB): capture photos, forms, signatures, time entries while offline; sync when back online
- [ ] **P1** Live location ping (tech GPS) — opt-in per member, stored in `member_location_pings`
- [ ] **P1** Turn-by-turn handoff (open in Google/Apple Maps)
- [ ] **P2** Barcode/QR scan to look up stock or asset

**Routes:** `src/app/(tech)/*`
**Storage:** `supabase://job-photos/<business_id>/<job_id>/`

## 1.4 Inventory & Stock

- [x] Products catalog (name, price)
- [ ] **P0** Stock levels per product per warehouse/van
- [ ] **P0** Stock movements (purchase, consume-on-job, transfer, adjustment)
- [ ] **P1** Low-stock alerts + auto-reorder suggestions
- [ ] **P1** Purchase orders to suppliers
- [ ] **P2** Supplier catalog & cost price tracking → margin calc on products

**Data:** `warehouses`, `stock_levels`, `stock_movements`, `suppliers`, `purchase_orders`, `purchase_order_lines`

## 1.5 Sites, Assets & Service History

- [x] Sites exist
- [x] Site assets — `src/lib/actions/site-assets.ts`
- [ ] **P1** Asset service history timeline (every job that touched this asset, with tech + notes + photos)
- [ ] **P1** Asset warranty tracking (expiry date, supplier, doc upload)
- [ ] **P2** Asset maintenance schedule → auto-create recurring jobs

## 1.6 Online Booking Widget (customer self-book)

- [ ] **P0** Public booking page per business: `/book/<business-slug>`
- [ ] **P0** Select job type → select timeslot from tech availability → enter contact + address → creates a job in pending status
- [ ] **P0** Embeddable `<script>` snippet so customers can drop the widget on their own site
- [ ] **P1** Deposit required at booking (Stripe)
- [ ] **P1** Service area check (postcode lookup) before allowing booking

**Routes:** `src/app/book/[businessSlug]/page.tsx`, `src/app/api/public/booking/route.ts`

## 1.7 Payments

- [x] Invoice send, customer portal pay page (verify)
- [ ] **P0** Stripe Connect (each business connects their own Stripe account)
- [ ] **P0** Card-on-file (tokenised payment methods per customer)
- [ ] **P0** Deposit invoices + final balance invoices (partial payments)
- [ ] **P1** Tap-to-pay / in-person terminal (Stripe Terminal) for tech PWA
- [ ] **P1** Auto-charge on job completion (toggle per customer)
- [ ] **P1** Payment plans / subscriptions for recurring service contracts
- [ ] **P2** Apple/Google Pay on portal checkout

**Data:** `stripe_accounts`, `payment_methods`, `payment_intents`, `subscriptions`

## 1.8 Quotes → Jobs flow

- [x] Quote CRUD + PDF
- [ ] **P0** One-click "Accept quote" (from customer portal) → creates job + schedules if requested
- [ ] **P1** Multi-option quotes (good / better / best — customer picks one)
- [ ] **P1** Quote follow-up automation (trigger campaign on send, reminder if unopened)

---

# Part 2 — GoHighLevel (Growth & CRM)

## 2.1 CRM — Contacts, Pipelines, Opportunities

- [x] Contacts (basic)
- [ ] **P0** Unified contact record: customer + lead + person = one contact, with sources, tags, custom fields, full activity timeline (jobs, invoices, messages, emails, calls, form subs, page visits)
- [ ] **P0** Tags (manual + automation-applied)
- [ ] **P0** Custom fields per business
- [ ] **P0** Opportunities with pipeline stages (kanban board), monetary value, expected close date, owner
- [ ] **P0** Multiple pipelines per business (e.g., "New sales", "Reactivation", "Commercial bids")
- [ ] **P1** Smart lists / saved filters with bulk actions (tag, enrol in campaign, assign)
- [ ] **P1** Lead scoring (rule-based + engagement-based)
- [ ] **P2** Duplicate detection & merge

**Data:** `pipelines`, `pipeline_stages`, `opportunities`, `contact_tags`, `custom_fields`, `custom_field_values`, `contact_activities`

## 2.2 Unified Conversations Inbox

- [x] SMS messages exist
- [x] Email leads ingested to inbox
- [ ] **P0** Single inbox threading: SMS + email + web chat + portal messages, grouped by contact, with assignee
- [ ] **P0** Two-way email reply (send from business domain, track opens/clicks)
- [ ] **P0** Two-way SMS reply (Twilio per-business subaccount or shared number pool)
- [ ] **P1** Internal notes + @mentions inside a conversation
- [ ] **P1** Canned responses / snippets
- [ ] **P1** AI reply suggestions (use existing agents infra)
- [ ] **P2** WhatsApp channel
- [ ] **P2** Instagram / Facebook DM channel

**Data:** `conversations`, `conversation_messages`, `conversation_participants`

## 2.3 Marketing Automation — Workflow Builder (biggest gap)

- [ ] **P0** Visual workflow builder: nodes = triggers, actions, conditions, delays, branches
- [ ] **P0** Triggers: form submitted, tag added, opportunity stage change, appointment booked, invoice paid, job completed, inbound SMS/email, webhook received, manual enrolment
- [ ] **P0** Actions: send email, send SMS, add/remove tag, create task, create opportunity, update contact field, send webhook, wait X, if/else branch, assign to user, create job, send quote
- [ ] **P0** Enrolment history per contact (which workflows, which step, when)
- [ ] **P1** A/B split nodes
- [ ] **P1** Goal nodes (if goal hit, exit workflow)
- [ ] **P2** Re-entry rules, enrolment caps

**Data:** `workflows`, `workflow_nodes`, `workflow_edges`, `workflow_enrolments`, `workflow_step_runs`
**Engine:** background worker (Supabase pg_cron or Vercel cron) processes due step runs

## 2.4 Email Marketing

- [ ] **P0** Broadcasts (one-off sends to a smart list)
- [ ] **P0** Email templates with merge fields
- [ ] **P0** Sender domain verification (SPF/DKIM via Resend)
- [ ] **P0** Open + click tracking, bounces, unsubscribes (CAN-SPAM compliant footer injected)
- [ ] **P1** Drip sequences (series of emails spaced over days) — can also be built via workflow
- [ ] **P1** Drag-and-drop email editor (or MJML + block library)

**Data:** `email_templates`, `email_broadcasts`, `email_events` (opens, clicks, bounces)

## 2.5 Calendars & Booking Pages

- [ ] **P0** Per-user (and per-business) bookable calendars
- [ ] **P0** Availability rules (working hours, buffers, min notice, max future days)
- [ ] **P0** Public booking page `/cal/<slug>` with timeslot picker
- [ ] **P0** Google Calendar two-way sync (free/busy + event push)
- [ ] **P1** Round-robin team calendars (auto-assign)
- [ ] **P1** Group events / classes (multi-attendee)
- [ ] **P2** Outlook/Microsoft 365 sync
- [ ] **P2** Paid bookings (Stripe)

**Data:** `calendars`, `availability_rules`, `appointments`, `calendar_integrations`

## 2.6 Forms & Surveys

- [ ] **P0** Form builder (field types: text, number, select, multi-select, file, rating, signature, address)
- [ ] **P0** Hosted form URL + embeddable snippet + iframe
- [ ] **P0** Submissions create/update contacts, can trigger workflows, can apply tags
- [ ] **P1** Conditional logic (show/hide fields)
- [ ] **P1** Survey mode (one question per screen, progress bar)

**Data:** `forms`, `form_fields`, `form_submissions`

## 2.7 Funnels / Landing Pages

- [ ] **P1** Page builder (section-based, block library: hero, features, testimonials, pricing, form, CTA, video)
- [ ] **P1** Multi-step funnels (page A → page B → thank-you)
- [ ] **P1** Custom domains per funnel
- [ ] **P1** A/B testing (variant split + winner selection)
- [ ] **P2** Template gallery

**Data:** `funnels`, `funnel_pages`, `page_blocks`, `funnel_domains`

## 2.8 Reputation Management

- [ ] **P0** Review request automation (on job complete → send SMS/email asking for review)
- [ ] **P0** Smart review gate (4–5 stars → route to Google/Facebook; 1–3 stars → private feedback form)
- [ ] **P1** Google Business Profile integration (pull reviews, reply from inbox)
- [ ] **P1** Facebook page reviews integration
- [ ] **P2** Reputation score dashboard over time

**Data:** `review_requests`, `reviews`, `review_platform_accounts`

## 2.9 AI Web Chat Widget

- [x] Agents infra exists
- [ ] **P0** Embeddable chat widget script for the business's own website
- [ ] **P0** Widget pulls from business's trained agent, books appointments, captures leads, handoff to human in inbox
- [ ] **P1** Proactive messages (open after N seconds, or on exit intent)
- [ ] **P1** Voice mode in widget (mic → STT → agent → TTS)

**Routes:** `src/app/(public)/chat/[businessSlug]/page.tsx`, `public/widget.js`

## 2.10 Memberships & Courses

- [ ] **P2** Course builder (modules → lessons, video + text + quiz)
- [ ] **P2** Gated member portal
- [ ] **P2** Paid membership tiers (Stripe subscription)

## 2.11 Call Tracking & Voice

- [ ] **P1** Twilio phone numbers per business
- [ ] **P1** Inbound call tracking (which marketing source → which call → which contact)
- [ ] **P1** Call recordings (with consent banner), transcripts (Whisper), summaries
- [ ] **P2** IVR menu builder
- [ ] **P2** AI voice agent answers + books appointments (Twilio Media Streams + STT/TTS + agent)

## 2.12 Ad Attribution

- [ ] **P1** UTM capture on every form/booking/landing page submission
- [ ] **P1** Contact-level source attribution (first-touch + last-touch)
- [ ] **P2** Google Ads + Meta Ads integration: pull spend, push conversions via CAPI
- [ ] **P2** ROI dashboard: spend → leads → opportunities → revenue per campaign

---

# Part 3 — Cross-cutting Platform

## 3.1 AI Agents & Voice

- [x] Agents framework exists
- [ ] **P0** Every server action registered as an AI tool with Zod schema + description
- [ ] **P0** Voice-in (mic → Whisper → agent) on dashboard globally
- [ ] **P0** Voice-out (TTS of agent replies, togglable)
- [ ] **P1** Agent per business, trained on business's products, FAQs, docs, past jobs
- [ ] **P1** Agent actions require confirmation for destructive operations (delete, mass-send)
- [ ] **P2** Agent playbooks (pre-defined multi-step tasks the business can invoke)

## 3.2 Reporting & Analytics

- [x] Basic reports
- [ ] **P1** Dashboards: revenue, AR aging, jobs completed, tech utilisation, avg job value, margin
- [ ] **P1** Marketing: funnel conversion rates, campaign ROI, cost per lead, LTV
- [ ] **P1** Pipeline: win rate, avg deal size, stage velocity
- [ ] **P2** Custom dashboard builder (user-configurable widgets)
- [ ] **P2** Scheduled emailed reports

## 3.3 Notifications

- [ ] **P0** In-app notification centre (bell icon, unread count, categories)
- [ ] **P0** Per-user notification preferences (channel × event matrix)
- [ ] **P1** Push notifications for tech PWA (new job assigned, schedule change)
- [ ] **P1** Daily/weekly digest emails

## 3.4 Permissions & Roles

- [ ] **P0** Role-based access: owner, admin, dispatcher, tech, sales, read-only
- [ ] **P0** Per-role route/action guards (server-side enforced, not just UI)
- [ ] **P1** Custom roles with granular permission toggles
- [ ] **P2** Audit log (who did what when)

**Data:** `roles`, `role_permissions`, `member_roles`, `audit_log`

## 3.5 Integrations

- [x] Resend (email)
- [x] Webhooks (outbound basics)
- [ ] **P0** Stripe Connect
- [ ] **P0** Twilio (SMS + voice)
- [ ] **P0** Google Calendar
- [ ] **P1** Google Business Profile
- [ ] **P1** QuickBooks / Xero (accounting sync)
- [ ] **P1** Zapier / Make (public app)
- [ ] **P2** Meta & Google Ads
- [ ] **P2** Slack (internal notifications)

## 3.6 Public API & Webhooks

- [x] `/api/v1/leads`, `/api/v1/customers`, `/api/v1/agent`
- [ ] **P0** Complete REST coverage: jobs, quotes, invoices, contacts, opportunities, appointments, forms, conversations
- [ ] **P0** Outbound webhooks: subscriber can pick events (`job.completed`, `invoice.paid`, `form.submitted`, etc.), signed payloads, retry w/ backoff
- [ ] **P1** Public OpenAPI spec + docs site
- [ ] **P2** GraphQL endpoint (nice-to-have, not required)

## 3.7 Billing (our SaaS billing for the businesses that use us)

- [ ] **P1** Plans & pricing tiers
- [ ] **P1** Usage metering (SMS sent, emails sent, agent tokens)
- [ ] **P1** Self-serve upgrade/downgrade + invoices
- [ ] **P2** Agency/white-label mode (resell to sub-accounts)

## 3.8 Onboarding & Setup

- [ ] **P1** First-run wizard: business profile, branding, currency, timezone, invite team, connect Stripe, verify sending domain, import contacts
- [ ] **P1** Sample data / demo mode
- [ ] **P2** Industry templates (plumber, electrician, cleaner, etc.) pre-configure pipelines + job types + workflows

## 3.9 Data Import / Export

- [ ] **P1** CSV import: contacts, products, jobs (with field-mapping UI)
- [ ] **P1** Export: any list → CSV
- [ ] **P2** Migration assistants (ServiceM8 export, GHL export) — parse + map

---

# Part 4 — Quality & Ops guardrails

- [ ] **P0** RLS policy check on every new table before it ships
- [ ] **P0** Every server action: Zod input validation + active-business scope check
- [ ] **P0** Every external endpoint: `authenticateApiKey` + `requireScope`
- [ ] **P1** E2E smoke test per capability (Playwright) — must pass before marking a capability done
- [ ] **P1** Error monitoring (Sentry) wired to server actions
- [ ] **P1** Rate limits on public endpoints (booking, forms, chat widget, API)
- [ ] **P2** Load test key flows (workflow engine, inbox, dispatch board)

---

## Priority legend

- **P0** = table stakes; platform isn't the pitch without it
- **P1** = strong differentiator, ship soon after P0 of the same capability
- **P2** = nice-to-have, ship when adjacent areas are solid

## Change log

- 2026-04-23 — Initial scope document created.
