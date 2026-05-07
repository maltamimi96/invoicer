# Kirei QA Checklist

A full functional test pass for the app. Use this as the canonical source — copy/paste into a GitHub issue at the start of each QA cycle so you get tickable checkboxes.

How to test efficiently:
1. Auth + dashboards (sections 1-3) — confirms basic plumbing.
2. Daily-driver flows (6-9) — quotes, invoices, work orders, reports.
3. Settings (18) — make sure your data is right.
4. Customer portal (19).
5. Recent additions (20-22) — AI, delivery, scheduled sends.
6. Polish + cross-cutting (23-26).

Failing items: paste the section number + failing item into a comment on the QA issue.

---

## 1. Auth & onboarding

- [ ] Visit `/auth/login` — see Kirei branding (logo block + testimonial)
- [ ] Sign in with existing account → lands on `/dashboard`
- [ ] Sign out → redirected to `/auth/login`
- [ ] Sign up new account from `/auth/register` → guided to create a business
- [ ] Visit `/auth/register?email=x@y.com&biz=...` (invite link path) → email pre-filled, redeems invite on signup
- [ ] Forgotten password flow works end-to-end

## 2. Dashboard (owner)

- [ ] Greeting matches time of day (morning/afternoon/evening)
- [ ] Overdue strip shows when there are overdue invoices, hidden when none
- [ ] KPI cards: Revenue, Outstanding, Overdue, Paid this month — all use correct currency
- [ ] Revenue chart shows last 6 months
- [ ] Recent invoices table — clicking a row navigates to that invoice
- [ ] Quick actions tile (right sidebar) navigates correctly
- [ ] Today's jobs list shows scheduled jobs

## 3. Dashboard (worker view)

- [ ] Login as a worker → sidebar only shows: Dashboard, Work Orders, Schedule, Help
- [ ] Worker dashboard matches the rest of the app's design (same fonts, teal accents)
- [ ] KPI strip shows: Today, On site now, Upcoming, Done this week
- [ ] "Jobs in progress" amber strip appears when applicable
- [ ] Today's jobs + Upcoming sit side-by-side
- [ ] Worker cannot navigate to `/customers`, `/leads`, `/quotes`, `/invoices`, `/team` — gets redirected

## 4. Customers

- [ ] List shows customers with stats columns (invoice count, billed, outstanding)
- [ ] Search filters live
- [ ] Multi-select checkboxes → bulk archive works
- [ ] Click a customer → detail page loads
- [ ] Add customer form works
- [ ] Smart Organise button finds duplicates / suggests cleanups
- [ ] Smart Organise apply works → undo works
- [ ] Customer detail shows their invoices, quotes, jobs
- [ ] **Customer hub link** button on detail page (next to Edit)
  - [ ] Opens dialog with the link already loaded — no "click to generate"
  - [ ] Reuses any active 90-day token (same link as last time)
  - [ ] Copy / Open / WhatsApp / SMS / Email shortcuts present
  - [ ] WhatsApp + SMS only show when customer has a phone on file
  - [ ] **Rotate** button revokes the old token and mints a fresh one

## 5. Leads

- [ ] List view with status colour-tinted cards
- [ ] Add lead manually
- [ ] Convert lead → customer
- [ ] Convert lead → quote
- [ ] Convert lead → work order
- [ ] Lead status changes (new → contacted → quoted → won/lost)
- [ ] Smart Organise on leads

## 6. Quotes

- [ ] List view, filter by status
- [ ] New quote — pick customer, add line items from catalog or manually
- [ ] Smart Fill with paste → respects already-selected customer (doesn't create duplicate)
- [ ] Discount applied correctly (% and fixed)
- [ ] Tax calculation correct
- [ ] Save → quote opens in detail view
- [ ] PDF download — logo + business contact + licence number visible on every page
- [ ] Send email with attached PDF
- [ ] Send SMS with portal link
- [ ] Schedule for later toggle in send modal → datetime picker → schedule succeeds
- [ ] Scheduled-sends card appears with cancel button → cancel works
- [ ] Delivery status card shows sent → delivered → opened (after Resend webhook config)
- [ ] Share link button → opens dialog with doc + hub URLs + WhatsApp/SMS/email shortcuts → links open correctly
- [ ] Duplicate menu item creates a copy (status: draft, "(copy)" appended)
- [ ] Reset to draft in status menu works
- [ ] Mark as expired option present
- [ ] Convert quote → invoice (preserves line items + customer)
- [ ] Customer name shows large + prominent on PDF + portal
- [ ] Currency reflects business setting

## 7. Invoices

- [ ] List view, filter by status (draft/sent/paid/overdue/cancelled)
- [ ] New invoice — same flow as quote
- [ ] Smart Fill respects pre-selected customer
- [ ] PDF download — logo + contact + licence visible
- [ ] Send email — attaches PDF, includes portal link
- [ ] Send SMS — sends portal link
- [ ] Schedule for later works for both email + SMS
- [ ] Scheduled-sends card + cancel button visible
- [ ] Delivery status updates from Sent → Delivered → Opened
- [ ] Share link dialog
- [ ] Duplicate in dropdown
- [ ] Reset to draft in status dropdown
- [ ] Mark paid / sent / cancelled dropdown options
- [ ] Record payment — partial payments update status to "partial", full payment marks "paid"
- [ ] Payment history sidebar shows recorded payments
- [ ] Send deposit opens progress invoice modal
  - [ ] 30% preset works
  - [ ] Custom amount works
  - [ ] Remainder preset works
  - [ ] Resulting deposit invoice keeps original line items + appends "Balance due on completion" line
  - [ ] Total = deposit amount, no NaN
- [ ] Send remainder button appears on parent once children exist
- [ ] When deposit child is paid → parent shows "Deposits received" line + adjusted balance due
- [ ] Parent auto-flips to paid when collected ≥ total
- [ ] Currency consistent across portal, PDF, email
- [ ] Workers cannot delete invoices

## 8. Work orders / Jobs

- [ ] List view, status tabs filter correctly
- [ ] New work order — pick customer/site/contact, schedule, assign workers
- [ ] Work order detail loads — Job Portfolio view with sticky TOC
- [ ] Status pipeline pills update on status change
- [ ] Workers card on header — clicking opens AssignWorkersDialog
  - [ ] Multi-select to add workers
  - [ ] Save → workers update on the page
  - [ ] Timeline logs the assignment change
- [ ] Only owner/admin sees the edit pencil on Workers card
- [ ] Workers cannot delete the work order
- [ ] Workers list dropdown — Delete option hidden for workers
- [ ] Photos section — upload, caption, mark phase (before/during/after), delete
- [ ] Time tracking — start/stop, manual entry, delete
- [ ] Materials — add product, quantity, total
- [ ] Documents — upload, view, delete
- [ ] Signatures — add, view, delete
- [ ] Financials — linked quotes/invoices visible, "Invoice unbilled" works
- [ ] Share link for the job page (worker-friendly view via `/jobs/[token]`)
- [ ] PDF download of the work order

## 9. Reports / Site Reports

- [ ] List view of inspection reports
- [ ] New report — generate via AI from photos + description
- [ ] Inspector Name + Inspector Licence Number (optional) fields present
- [ ] AI generates sections, photo captions, risk items
- [ ] Detail page shows inspector + licence (e.g. "Jane Doe (Lic. 471250C)")
- [ ] Toggle Complete / Back to Draft works
- [ ] PDF download — every page has business header (logo + phone/email/website + licence + ABN)
- [ ] DOCX download works
- [ ] Share link button → portal page renders correctly with prepared-for + photos
- [ ] Duplicate button creates a copy
- [ ] Edit individual sections inline, save persists
- [ ] Edit photo captions inline
- [ ] Delete report (owner only)

## 10. Schedule

- [ ] Calendar view shows scheduled jobs
- [ ] Drag/drop or reschedule via UI
- [ ] Worker filter (when owner/admin)
- [ ] Worker only sees their own scheduled jobs

## 11. Tasks

- [ ] Kanban board renders
- [ ] Add task, change status by dragging
- [ ] Tag/link to a customer or job
- [ ] Mobile (Connected Hub) shows tasks correctly

## 12. Messages

- [ ] Inbox view
- [ ] Reply to a message
- [ ] Send a new message

## 13. Products

- [ ] List with stored prices
- [ ] Add product — name, price, tax rate, unit
- [ ] Edit / archive
- [ ] Smart Organise on products

## 14. Recurring

- [ ] List of recurring jobs
- [ ] Create recurring (template + cadence)
- [ ] Activate / deactivate
- [ ] Cron generates next instances on schedule

## 15. Team

- [ ] List of team profiles
- [ ] Add team member form — fills email, name, phone, role title, skills
- [ ] On submit → invite email is sent
- [ ] Pending invite shows in Settings → Team with code
- [ ] Edit profile
- [ ] Delete profile (owner only)

## 16. Agents

- [ ] List of automation agents (reminders, daily digest, etc.)
- [ ] Toggle each agent on/off per business
- [ ] Settings persist
- [ ] Agent run logs visible

## 17. Analytics

- [ ] Range selector pills (30d / 90d / 12m / YTD)
- [ ] KPI strip: Revenue (with delta %), Outstanding, Overdue, Avg invoice
- [ ] Revenue last-12-months bar chart (paid filled, invoiced outline)
- [ ] Top 5 customers table with rank medallions
- [ ] Quote outcome donut with accept rate centred
- [ ] A/R aging bars (Current / 1-30 / 31-60 / 61-90 / 90+)
- [ ] Lead funnel with conversion %

## 18. Settings

### Business tab
- [ ] Name, email, phone, website, address, city, postcode, country
- [ ] Licence number field
- [ ] VAT / Tax number
- [ ] Currency selector
- [ ] Logo upload — appears on PDFs + customer portal headers
- [ ] Save → revalidates everywhere

### Bank tab
- [ ] Bank name, account name, account number, sort code, IBAN
- [ ] Saved fields appear on customer portal "How to pay" card

### Team tab
- [ ] List of business members + status (active/pending)
- [ ] Add member by email + role
- [ ] Owner can add admin; admin cannot
- [ ] Copy invite code for pending members
- [ ] Update role
- [ ] Remove member (owner can remove anyone, admin can't remove other admins)

### API Keys tab
- [ ] Generate API key for AI agent endpoint
- [ ] Revoke key

### Profile tab
- [ ] Update display name + avatar

### Appearance / Personalize
- [ ] Accent colour picker
- [ ] Background pattern picker
- [ ] Sidebar theme picker
- [ ] Changes apply live

## 19. Customer portal

### Hub page
- [ ] Logo renders large (64-80px) with white card backing
- [ ] Business name + phone + licence shown in header
- [ ] Greeting with customer's first name
- [ ] Outstanding balance card (when balance > 0)
- [ ] Currency matches business setting
- [ ] Summary cards: Invoices / Quotes / Jobs counts
- [ ] Invoices clickable (opens detail)
- [ ] Quotes clickable
- [ ] Work orders open share-token page
- [ ] Reports section appears with reports listed
- [ ] Footer "Powered by Kirei"

### Invoice portal page
- [ ] Logo big + business contact in header
- [ ] "Billed to" card shows customer name large + address
- [ ] Line items table with correct prices in correct currency
- [ ] Totals (Subtotal, Discount, Tax, Total, Paid, Balance due)
- [ ] Payment history if any
- [ ] "How to pay" card with bank details + reference + amount (when balance > 0 + bank fields set)
- [ ] Notes / Terms shown if set
- [ ] Download PDF button works

### Quote portal page
- [ ] Header + "Prepared for" same treatment
- [ ] Line items + totals
- [ ] Accept-quote action (if not already accepted)
- [ ] Download PDF

### Report portal page
- [ ] Header + "Prepared for" card
- [ ] Property/inspection summary (inspector + licence)
- [ ] Sections render
- [ ] Photo grid
- [ ] Download PDF (works without auth via `?token=`)

## 20. AI assistant / Agent panel

- [ ] Bottom-left round button always visible (icon-only, doesn't cover other CTAs)
- [ ] Click → panel opens
- [ ] Type a message → AI responds
- [ ] AI sees live context: ask "how much is outstanding?" → quotes the actual figure
- [ ] AI sees current page — say "send a reminder for this invoice" while on `/invoices/[id]` → AI knows which one
- [ ] Tool steps render with check marks as actions complete
- [ ] Navigation suggestions clickable
- [ ] Mic button — tap to start, tap to stop
- [ ] Red "Listening" bubble appears with live transcript as you speak
- [ ] On stop → final text auto-sends
- [ ] Microphone-permission errors shown clearly
- [ ] Short blip → "Recording too short" message
- [ ] Clear conversation button works

## 21a. AI briefing / Assistant page (NEW)

### `/assistant` page
- [ ] Sidebar shows new "Assistant" link in Workspace section
- [ ] Page title: "Your AI assistant"
- [ ] Briefing items list every priority of attention item
- [ ] Items grouped/sorted: high priority first, then by age
- [ ] Each item shows: type label, title, subtitle, snooze button, dismiss button, action button
- [ ] Click action button → navigates to relevant entity (invoice/quote/lead/job)
- [ ] Click snooze (clock icon) → item hides for 24h, reappears after
- [ ] Click dismiss (X) → item hidden until something changes about that entity
- [ ] Refresh button reloads with current state
- [ ] Empty state when caught up: "Your inbox is zero — take a break"

### Header bell (NEW)
- [ ] Sparkles icon in the top nav (left of dark mode toggle)
- [ ] Badge shows count of items (rose-coloured if any are high priority)
- [ ] Click opens a popover with the briefing list
- [ ] Each row has Snooze / Done / action buttons
- [ ] Click action button → closes popover + navigates
- [ ] "Open full briefing" link at the bottom takes you to /assistant
- [ ] Polls every 60s while open to stay current
- [ ] Inbox-zero state shows green checkmark + friendly copy

### Dashboard widget
- [ ] Briefing widget appears below the 2-col dashboard body (not above)
- [ ] Shows top 5 items + "See all" link when more
- [ ] Each row has Snooze / Done / action buttons (not just X)
- [ ] "Done" button is emerald-coloured with checkmark icon
- [ ] Refresh button works
- [ ] Empty state when nothing is pending

### Item types verified
- [ ] **Overdue invoices** — appears for invoices past due_date with balance > 0
- [ ] **Stale quotes** — appears for quotes sent > 7 days ago, no movement
- [ ] **Draft quotes** — appears for drafts sitting > 3 days
- [ ] **New leads** — appears for status=new (priority increases past 2 days)
- [ ] **Stale leads** — appears for status=contacted, > 5 days no movement
- [ ] **Today's jobs** — appears for jobs scheduled today, with assigned/unassigned variants
- [ ] **Submitted work orders** — appears for status=submitted (waiting review)
- [ ] **Completed unbilled** — appears for completed jobs in last 30d not yet invoiced

### Snooze persistence
- [ ] Snooze a high-priority item → item disappears
- [ ] Refresh → item still hidden
- [ ] After 24h (or DB-level update) → item reappears
- [ ] Dismiss permanently → item stays hidden until underlying entity changes

## 22. Email delivery tracking

- [ ] Send any invoice/quote → DeliveryStatusCard appears on detail
- [ ] Status starts at Sent (in transit)
- [ ] After Resend webhook: flips to Delivered
- [ ] If recipient opens: flips to Opened
- [ ] If recipient bounces: shows Bounced + red hint about domain verification
- [ ] Refresh button updates the latest status
- [ ] Multiple recipients show separately

## 22. Scheduled sends

- [ ] Schedule an invoice for "in 2 minutes" → ScheduledSendsCard shows it as Pending
- [ ] Cron fires within 60s of scheduled time → status flips to Sent
- [ ] Pending send can be cancelled before its time → status: Cancelled
- [ ] Failed send shows reason in card
- [ ] Schedule SMS works the same way

## 23. Smart Organise

Per entity (customers, contacts, leads, invoices, quotes, products, work orders, team profiles):
- [ ] Click "Smart Organise" → modal opens with progress
- [ ] AI proposes merges / archives / tidies
- [ ] Apply → log entries created
- [ ] Undo restores previous state

## 24. Voice command coverage

Try saying these and verify behaviour:
- [ ] "Show me invoices outstanding"
- [ ] "How much money is overdue?"
- [ ] "Create a new customer John Doe"
- [ ] "Send a deposit invoice for John for 30 percent"
- [ ] "What jobs do I have today?"
- [ ] "Reschedule the Smith Street job to Friday"
- [ ] "Send Mike to the 42 Main St job tomorrow at 2pm"
- [ ] "Send a reminder for this invoice" (while on an invoice page)

## 25. Connected Hub mobile app (worker app)

### Auth
- [ ] Login screen — sign in with existing account works
- [ ] "Got an invite code?" → enter email + 8-char code + password → joins business
- [ ] Sign out

### Tabs
- [ ] Dashboard — today's jobs visible
- [ ] Tasks — kanban with priority dot, due date, tag chips, checkbox toggle
- [ ] Schedule — upcoming jobs
- [ ] Settings — profile + sign out

### Job detail
- [ ] Booker contact + on-site contact cards
- [ ] Native maps deep link from address
- [ ] Photo gallery — pinch to zoom, delete from modal
- [ ] Pre-filled notes
- [ ] Status update buttons (Start / Submit / etc.)

## 26. Cross-cutting / regression

- [ ] Multi-business switcher (top-left) — switching changes data
- [ ] Currency change in Settings → reflects everywhere immediately
- [ ] Logo change → reflects on PDFs + portal within seconds
- [ ] Worker access enforcement — try to hit `/customers` as worker → redirected
- [ ] Business deletion / leaving — owner cannot leave their own business
- [ ] All 200/300 API responses return JSON (no HTML error pages)
