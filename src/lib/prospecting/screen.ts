/**
 * The cheap pass, before any model is called.
 *
 * Verification costs money per candidate, and most of what Places returns is
 * disqualified by facts a model shouldn't be asked to establish: it already
 * exists in your list, the hard filter says no, the "website" is a Facebook
 * page. Screening in code first is roughly a tenth the cost of judging
 * everything, and it is also more RELIABLE — "is this already a customer" is a
 * database question, and a model asked to answer it will sometimes guess.
 *
 * Plain module. No session, no network for the deterministic parts.
 */

import type { PlaceHit } from "./places";

export interface HuntFilters {
  /** Only businesses with no real website. The headline use case. */
  no_website?: boolean;
  /** Only businesses WITH a website (the inverse hunt). */
  has_website?: boolean;
  min_rating?: number;
  max_rating?: number;
  min_reviews?: number;
  max_reviews?: number;
  /** Skip anything without a phone — nothing to reach them on. */
  require_phone?: boolean;
}

export type ScreenResult =
  | { keep: true; checks: Record<string, unknown> }
  | { keep: false; reason: string; checks: Record<string, unknown> };

/**
 * Hosts that are a social or directory presence, not a website.
 *
 * A tradie whose Places listing points at their Facebook page is exactly the
 * lead a "no website" hunt is looking for — treating that as "has a website"
 * would filter out the best candidates. This is the difference between the
 * feature working and not.
 */
const NOT_A_WEBSITE = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "tiktok.com", "youtube.com", "wa.me", "linktr.ee",
  "yellowpages.com", "truelocal.com", "hotfrog.com", "localsearch.com",
  "oneflare.com", "hipages.com", "airtasker.com", "serviceseeking.com",
  "google.com", "business.site", "sites.google.com",
];

/**
 * Country variants of the same platform: hipages.com.au, facebook.com.au.
 * Stripping the ccTLD lets one entry above cover every country's copy —
 * without it, `hipages.com.au` (the actual Australian domain) sails straight
 * past a list that only knows `hipages.com`.
 */
const CC_TLD = /\.(au|nz|uk|ca|za|in|sg|ie|my|ph)$/;

/** Is this URL a real site of their own, or a profile on someone else's? */
export function isRealWebsite(url: string | null | undefined): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const base = host.replace(CC_TLD, "");
  return !NOT_A_WEBSITE.some((bad) =>
    base === bad || base.endsWith(`.${bad}`) || host === bad || host.endsWith(`.${bad}`),
  );
}

/** Last 9 digits, matching the generated phone_digits column. */
export function phoneKey(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "").slice(-9);
  return d.length >= 6 ? d : null;
}

/**
 * Apply the hard filters and the known-already checks.
 *
 * @param known  phone keys and normalised names already in prospects/customers
 */
export function screenCandidate(
  hit: PlaceHit,
  filters: HuntFilters,
  known: { phones: Set<string>; websites: Set<string> },
): ScreenResult {
  const real = isRealWebsite(hit.website);
  const checks: Record<string, unknown> = {
    has_listing_website: Boolean(hit.website),
    website_is_real: real,
    phone: Boolean(hit.phone),
  };

  if (filters.no_website && real) {
    return { keep: false, reason: "Has a real website", checks };
  }
  if (filters.has_website && !real) {
    return { keep: false, reason: "No real website", checks };
  }
  if (filters.require_phone && !hit.phone) {
    return { keep: false, reason: "No phone number", checks };
  }
  if (filters.min_rating != null && (hit.rating ?? 0) < filters.min_rating) {
    return { keep: false, reason: `Rating below ${filters.min_rating}`, checks };
  }
  if (filters.max_rating != null && hit.rating != null && hit.rating > filters.max_rating) {
    return { keep: false, reason: `Rating above ${filters.max_rating}`, checks };
  }
  if (filters.min_reviews != null && (hit.review_count ?? 0) < filters.min_reviews) {
    return { keep: false, reason: `Fewer than ${filters.min_reviews} reviews`, checks };
  }
  if (filters.max_reviews != null && (hit.review_count ?? 0) > filters.max_reviews) {
    return { keep: false, reason: `More than ${filters.max_reviews} reviews`, checks };
  }

  // Already yours — a prospect, or a customer you're already working with.
  // Presenting these for review wastes the operator's attention, which is the
  // scarcest thing in the whole loop.
  const pk = phoneKey(hit.phone);
  if (pk && known.phones.has(pk)) {
    checks.already_known = "phone";
    return { keep: false, reason: "Already in your contacts or prospects", checks };
  }
  if (real && hit.website) {
    try {
      const host = new URL(hit.website).hostname.toLowerCase().replace(/^www\./, "");
      if (known.websites.has(host)) {
        checks.already_known = "website";
        return { keep: false, reason: "Already in your contacts or prospects", checks };
      }
    } catch { /* unparseable — treat as new */ }
  }

  return { keep: true, checks };
}
