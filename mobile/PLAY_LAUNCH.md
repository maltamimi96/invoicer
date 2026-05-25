# Kirei — Google Play launch checklist

Package name: **com.kireihq.app** · App name: **Kirei** (display) · Free
Privacy: https://www.kireihq.com/privacy · Support: https://www.kireihq.com/support

Work top-to-bottom. Play won't let you publish until every section under
**App content** and **Store listing** is green.

---

## 1. Store listing (Grow → Store presence → Main store listing)
| Field | Value |
|---|---|
| App name | Kirei |
| Short description (80) | Quotes, invoices, jobs and customers — run your trade business from your pocket. |
| Full description | (use the full description in STORE_LISTING.md) |
| App icon | 512×512 PNG, 32-bit, <1MB (your Kirei "K" mark on teal) |
| Feature graphic | 1024×500 — see spec below |
| Phone screenshots | 2–8, min 1080px on the short side (see list below) |

## 2. App content (Policy → App content) — answer each
- **Privacy policy:** `https://www.kireihq.com/privacy`
- **Ads:** No, my app does not contain ads
- **App access:** "All functionality is available without special access" → **No** (it needs login). Provide **demo login credentials** so reviewers can sign in:
  - Give a test account email + password (a seeded Kirei account with sample data).
  - Instructions: "Sign in with the demo account to view quotes, invoices, jobs, and customers."
- **Content rating:** start questionnaire → category **Business / Productivity** → answer **No** to all violence/sexual/gambling/etc. → it'll rate **Everyone / PEGI 3**.
- **Target audience:** ages **18+** (business tool). "Appeals to children?" **No**.
- **Data safety:** (Policy → App content → Data safety)
  - Does your app collect or share user data? **Yes**
  - **Collected** (all "Collected", not "Shared" for ads; purpose = App functionality + Account management):
    - Personal info: Name, Email address, Phone number
    - Financial info: "Other financial info" (quotes/invoices you enter)
    - Photos
    - App activity, App info & performance (crash logs), Device or other IDs
  - Encrypted in transit: **Yes** · Data deletion available: **Yes** (users email support@kireihq.com / delete in-app)
  - Sold to third parties: **No**
- **Government apps:** No
- **Financial features:** No (it manages your own invoicing; it's not a banking/lending app)
- **Health:** No

## 3. Release (Testing → Internal testing, OR Production)
- Internal testing (instant, no review): Create release → upload `.aab` → name `1.0.0` → roll out → add tester Gmails → share opt-in link.
- Production (public): Create release → upload `.aab` → roll out → Submit (Google review, few hours–2 days).

---

## Feature graphic spec (1024 × 500 px, PNG/JPG, no transparency)
Build in Canva in ~5 min (search "1024x500" custom size).

- **Background:** teal gradient, top-left `#3a847e` → bottom-right `#1f4f4a` (the Kirei brand gradient).
- **Left third:** the Kirei "K" logo mark (white), ~180px tall, vertically centred, ~80px from left.
- **Right two-thirds, stacked, left-aligned, white text:**
  - Line 1 (bold, ~64px): **Kirei**
  - Line 2 (medium, ~34px): Run your trade business
  - Line 3 (regular, ~26px, 80% opacity): Quotes · Invoices · Jobs · Customers
- Keep all text/logo within ~64px safe margins (Play crops edges on some surfaces).
- No screenshots or device frames in the feature graphic — keep it clean text + logo.

## Screenshots to capture (phone, in this order)
Capture on a real device or Android emulator (Pixel 6/7), portrait:
1. **Dashboard** — KPI tiles + today's schedule
2. **A Quote** — line items + total
3. **An Invoice** — with the pay/total and status pill
4. **Jobs list** — work orders with status
5. **A Job detail** — photos section visible
6. **Schedule** — calendar/day view

Optional caption bar on each (Canva): one short benefit line per shot
("Send quotes in seconds", "Get paid faster", "Manage every job", …).
