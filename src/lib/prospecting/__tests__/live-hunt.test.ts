import { describe, it, expect } from "vitest";
import { searchPlaces, withinRadius, type SearchArea } from "../places";
import { screenCandidate } from "../screen";
import { verifyCandidate } from "../verify";

/**
 * Live probe — costs money, opt-in:
 *
 *   RUN_LIVE_API=1 npx vitest run src/lib/prospecting/__tests__/live-hunt.test.ts
 *
 * This exists because of a bug that only a real call could catch: Text Search's
 * `locationRestriction` takes a rectangle, not a circle, and passing a circle
 * 400s. Nothing typechecks a request body and the unit tests mock the fetch, so
 * every hunt would have failed in production with the offline suite green.
 *
 * Any change to the request shape or the field mask should be re-run through
 * this before shipping.
 */
const live = process.env.RUN_LIVE_API === "1" && !!process.env.GOOGLE_PLACES_API_KEY;
const liveModel = live && !!process.env.ANTHROPIC_API_KEY;

// Parramatta — Crown Roofers' actual patch, so the results are recognisable.
const AREA: SearchArea = { lat: -33.8148, lng: 151.0017, radiusM: 10_000 };

describe.skipIf(!live)("searchPlaces (live)", () => {
  it("returns real listings inside the radius", async () => {
    const { hits, error, requests } = await searchPlaces(
      process.env.GOOGLE_PLACES_API_KEY!, "plumber", AREA, 1);

    expect(error).toBeNull();
    expect(requests).toBeGreaterThan(0);
    expect(hits.length).toBeGreaterThan(0);

    for (const h of hits) {
      expect(h.place_id).toBeTruthy();
      expect(h.name).toBeTruthy();
      // The radius is enforced here, not by Google — the box is bigger.
      expect(withinRadius(h, AREA)).toBe(true);
    }

    // The field that justifies using Places at all: without websiteUri,
    // "has no website" would be a guess.
    const withSite = hits.filter((h) => h.website).length;
    console.log(`  ${hits.length} hits · ${withSite} with a website · ${requests} request(s)`);
  }, 60_000);

  it("surfaces Google's own message on a bad key", async () => {
    const { error } = await searchPlaces("not-a-real-key", "plumber", AREA, 1);
    expect(error).toBeTruthy();
    expect(error).toMatch(/Places \d+/);
  }, 30_000);
});

describe.skipIf(!liveModel)("the full hunt chain (live)", () => {
  it("finds, screens, and judges — and the reasoning is about the business", async () => {
    const { hits } = await searchPlaces(
      process.env.GOOGLE_PLACES_API_KEY!, "plumber", AREA, 1);

    const nothingKnown = { phones: new Set<string>(), websites: new Set<string>() };
    const survivors = hits.filter(
      (h) => screenCandidate(h, { no_website: true, require_phone: true }, nothingKnown).keep);

    console.log(`  ${hits.length} found → ${survivors.length} past the no-website screen`);
    if (!survivors.length) {
      // Not a failure: in a well-served suburb every plumber may have a site.
      // That IS the answer the filter exists to give.
      console.log("  (nothing had no website — try a broader area)");
      return;
    }

    const criteria = "Service-based tradies who look like owner-operators or "
      + "small local crews — not franchises, national chains, or directories.";

    for (const hit of survivors.slice(0, 3)) {
      const verdict = await verifyCandidate(hit, criteria);
      console.log(`  ${verdict.fit ? "FIT " : "no  "} ${verdict.score}% — ${hit.name}: ${verdict.reasoning}`);

      expect(typeof verdict.fit).toBe("boolean");
      expect(verdict.score).toBeGreaterThanOrEqual(0);
      expect(verdict.score).toBeLessThanOrEqual(100);
      expect(verdict.reasoning.length).toBeGreaterThan(10);
      expect(verdict.cost_cents).toBeGreaterThan(0);
      // A verdict that just restates the brief is the failure mode worth
      // catching — the reasoning has to be about THIS business.
      expect(verdict.reasoning.toLowerCase()).not.toBe("appears to match the criteria");
    }
  }, 180_000);
});
