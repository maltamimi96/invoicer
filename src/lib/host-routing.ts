/**
 * Splitting the marketing site from the product by hostname.
 *
 *   kireihq.com      → the public site
 *   app.kireihq.com  → the product
 *
 * **Inert until NEXT_PUBLIC_APP_HOST is set.** With no value, every function
 * here returns null and the app behaves exactly as it does today on one
 * domain. That makes the switch an environment variable rather than a deploy,
 * and the rollback the same — which matters, because getting this wrong locks
 * people out of their own business.
 *
 * Three rules, each learned from what breaks:
 *
 *  1. **Never redirect /api.** Stripe and Revolut webhooks are registered
 *     against the current host. A 308 on a POST is not reliably followed, and
 *     a missed webhook is a payment that never gets recorded. API routes keep
 *     answering on both hosts, forever.
 *
 *  2. **Never redirect a public customer surface.** Portal links, booking
 *     pages, hosted forms and job share links are already out in the world in
 *     emails we cannot edit. They keep working on whichever host they were
 *     minted with.
 *
 *  3. **Sessions are NOT shared across the two hosts.** Cookies stay
 *     host-only rather than being widened to .kireihq.com. Widening them is
 *     the step that risks invalidating every existing session, and the only
 *     thing it buys is the marketing header knowing you are signed in. The
 *     cost is one re-login at the new host, once.
 */

/** e.g. "app.kireihq.com". Empty/unset disables host routing entirely. */
export function appHost(): string | null {
  const h = process.env.NEXT_PUBLIC_APP_HOST?.trim().toLowerCase();
  return h ? h.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
}

/** Pages that belong to the public site. */
const MARKETING_PATHS = new Set([
  "/", "/trades", "/agencies", "/pricing", "/contact-sales",
]);

/**
 * Paths that must answer on BOTH hosts and never be redirected: machine
 * callers and links already in the wild. Rules 1 and 2 above.
 */
function isSharedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/")
    || pathname.startsWith("/_next/")
    || pathname.startsWith("/.well-known/")
    || pathname.startsWith("/portal/")
    || pathname.startsWith("/book/")
    || pathname.startsWith("/f/")
    || pathname.startsWith("/embed/")
    || pathname.startsWith("/jobs/")
    || pathname.startsWith("/invoice/")
    || pathname.startsWith("/quote/")
    || pathname.startsWith("/unsubscribe/")
    // Legal pages are linked from the app stores and from emails; leaving them
    // on both hosts costs nothing and avoids breaking a listing.
    || pathname === "/privacy"
    || pathname === "/support"
  );
}

export function isMarketingPath(pathname: string): boolean {
  return MARKETING_PATHS.has(pathname);
}

/**
 * Where this request should be sent, or null to serve it here.
 *
 * @param host      the request's Host header
 * @param pathname  the request path
 */
export function hostRedirectTarget(host: string | null, pathname: string): string | null {
  const app = appHost();
  if (!app || !host) return null;

  const h = host.toLowerCase().split(":")[0];
  // Previews, localhost and any other host are left alone: a preview
  // deployment must keep serving the whole app from one origin, or it stops
  // being testable.
  const isApp = h === app;
  const isMarketing = isMarketingHost(h, app);
  if (!isApp && !isMarketing) return null;

  if (isSharedPath(pathname)) return null;

  if (isMarketing && !isMarketingPath(pathname)) {
    return `https://${app}${pathname}`;
  }
  if (isApp && isMarketingPath(pathname)) {
    // The app's own root is the dashboard, not the sales pitch.
    if (pathname === "/") return null;
    return `https://${siteHost(app)}${pathname}`;
  }
  return null;
}

/** "app.kireihq.com" → "kireihq.com". */
export function marketingHostFor(app: string): string {
  const parts = app.split(".");
  return parts.length > 2 ? parts.slice(1).join(".") : app;
}

/**
 * Where to send someone who lands on a marketing path at the app host.
 *
 * NEXT_PUBLIC_SITE_HOST exists because the canonical public host is not always
 * the bare apex: kireihq.com 307s to www.kireihq.com, so redirecting to the
 * apex would cost an extra hop on every link.
 */
export function siteHost(app: string): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_HOST?.trim().toLowerCase();
  return explicit ? explicit.replace(/^https?:\/\//, "").replace(/\/$/, "") : marketingHostFor(app);
}

/**
 * Is this the public site?
 *
 * Both the apex and its www form count. Matching only the apex is what let
 * app paths on www.kireihq.com fall through to the login page instead of
 * hopping to the app — the site is actually served on www.
 */
export function isMarketingHost(h: string, app: string): boolean {
  const apex = marketingHostFor(app);
  return h === apex || h === `www.${apex}` || h === siteHost(app);
}
