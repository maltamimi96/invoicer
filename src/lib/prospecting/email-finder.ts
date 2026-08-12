/**
 * Finding a contact address on a business's own website.
 *
 * THIS IS THE MISSING LINK between the two plugins. Google Places never
 * returns an email, and `autoEnroll` filters on `.not("email","is",null)` — so
 * until now every prospect a hunt found was permanently ineligible for a
 * sequence. Prospecting could find businesses and Outreach could email them,
 * and nothing could carry one to the other.
 *
 * COMPLIANCE, and why this is opt-in rather than automatic:
 *   Australia's Spam Act 2003 s.22 prohibits sending to addresses collected by
 *   address-harvesting software. Reading the contact address a business chose
 *   to publish on its own contact page is a different thing from harvesting —
 *   but the line is thin enough that it must be a deliberate, attributable
 *   act, which is what `outreach_settings.crawler_enabled` records. That flag
 *   has existed since the outreach agent shipped with nothing behind it; this
 *   is the code it was gating.
 *
 * Deliberately modest: no dependency, no JS execution, no crawling past the
 * pages a human would click to find a phone number. It reads the homepage and
 * the handful of paths that conventionally hold contact details, and stops at
 * the first address it trusts.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const MAILTO_RE = /href\s*=\s*["']mailto:([^"'?]+)/gi;

/**
 * Addresses that are never a person. Platform noise, tracking senders, and the
 * example addresses that ship inside themes — a template's `you@example.com`
 * looks exactly like a real find to a regex.
 */
const JUNK = [
  /^no-?reply/i, /^donotreply/i, /^postmaster@/i, /^abuse@/i, /^webmaster@/i,
  /example\.(com|org|net)$/i, /yourdomain/i, /@domain\./i, /@email\./i,
  /sentry\.io$/i, /wixpress\.com$/i, /@wordpress\./i, /squarespace\.com$/i,
  /godaddy\.com$/i, /@sentry\./i, /\.png$/i, /\.jpe?g$/i, /\.gif$/i, /\.svg$/i,
  /\.webp$/i, /\.css$/i, /\.js$/i, /^u[0-9a-f]{6,}@/i,
];

/** Paths a human would click looking for a phone number. Nothing deeper. */
const CONTACT_PATHS = [
  "/contact", "/contact-us", "/contactus", "/about", "/about-us",
  "/get-in-touch", "/enquiry", "/enquiries", "/quote",
];

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 1_500_000;

export interface FoundEmail {
  email: string;
  /** Which page it came from — shown to the operator, and an audit trail. */
  source: string;
}

function looksReal(email: string): boolean {
  if (email.length > 100 || email.length < 6) return false;
  if (JUNK.some((re) => re.test(email))) return false;
  // A local part that's a long hex blob is a tracking address, not a person.
  const [local] = email.split("@");
  if (/^[0-9a-f]{16,}$/i.test(local)) return false;
  return true;
}

/**
 * Prefer the address a human would pick.
 *
 * A page often exposes several: info@, the web developer's, and a staff
 * address. Role addresses at the business's OWN domain are the ones intended
 * for enquiries, so they sort first; anything on a different domain from the
 * site is almost always the agency that built it, and sorts last.
 */
function rank(email: string, siteHost: string): number {
  const [local, domain] = email.toLowerCase().split("@");
  const sameDomain = domain === siteHost || domain.endsWith(`.${siteHost}`)
    || siteHost.endsWith(`.${domain}`);
  let score = sameDomain ? 0 : 50;
  if (/^(info|hello|enquiries|enquiry|contact|admin|office|sales|mail)$/.test(local)) score -= 10;
  if (/^(accounts|billing|careers|jobs|hr|support|privacy|legal)$/.test(local)) score += 20;
  return score;
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Identify honestly. A site that wants to refuse us should be able to.
        "User-Agent": "KireiProspectBot/1.0 (+https://kireihq.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) return null;
    const text = await res.text();
    // A homepage should not be 1.5MB. Anything bigger is a download, not a page.
    return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function harvest(html: string): string[] {
  const found = new Set<string>();

  // mailto: first — an address a human deliberately linked, not one that
  // happens to appear in the markup.
  for (const m of html.matchAll(MAILTO_RE)) {
    const e = decodeURIComponent(m[1]).trim().toLowerCase();
    if (looksReal(e)) found.add(e);
  }
  for (const m of html.match(EMAIL_RE) ?? []) {
    const e = m.trim().toLowerCase();
    if (looksReal(e)) found.add(e);
  }
  return [...found];
}

/**
 * Look for a contact address on this website.
 *
 * Returns null rather than throwing: not finding one is the normal outcome for
 * a good fraction of small businesses, and it must never fail a run.
 */
export async function findEmail(website: string | null | undefined): Promise<FoundEmail | null> {
  if (!website) return null;

  let origin: string;
  let host: string;
  try {
    const u = new URL(website.startsWith("http") ? website : `https://${website}`);
    origin = u.origin;
    host = u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }

  const pages = [origin, ...CONTACT_PATHS.map((p) => origin + p)];

  for (const url of pages) {
    const html = await fetchText(url);
    if (!html) continue;

    const emails = harvest(html);
    if (emails.length) {
      emails.sort((a, b) => rank(a, host) - rank(b, host));
      return { email: emails[0], source: url };
    }
    // Be a polite guest. These are small businesses' shared hosting.
    await new Promise((r) => setTimeout(r, 250));
  }

  return null;
}
