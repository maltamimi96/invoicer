import { describe, it, expect } from "vitest";
import { isRealWebsite, phoneKey, screenCandidate } from "../screen";
import type { PlaceHit } from "../places";

function hit(over: Partial<PlaceHit> = {}): PlaceHit {
  return {
    place_id: "p1", name: "Ace Plumbing", address: "1 Test St", phone: "02 9000 0000",
    website: null, category: "Plumber", rating: 4.6, review_count: 30,
    lat: null, lng: null, raw: {}, ...over,
  };
}

const nothingKnown = { phones: new Set<string>(), websites: new Set<string>() };

describe("isRealWebsite", () => {
  it("treats a normal domain as a website", () => {
    expect(isRealWebsite("https://aceplumbing.com.au")).toBe(true);
    expect(isRealWebsite("https://www.aceplumbing.com.au/contact")).toBe(true);
  });

  // The whole "no website" hunt depends on this: a tradie whose only web
  // presence is a Facebook page IS the prospect, not a miss.
  it("does not count social or directory profiles", () => {
    for (const url of [
      "https://facebook.com/aceplumbing",
      "https://www.facebook.com/aceplumbing",
      "https://m.facebook.com/aceplumbing",
      "https://instagram.com/aceplumbing",
      "https://hipages.com.au/connect/aceplumbing",
      "https://aceplumbing.business.site",
      "https://linktr.ee/ace",
    ]) {
      expect(isRealWebsite(url), url).toBe(false);
    }
  });

  it("handles absent and malformed values", () => {
    expect(isRealWebsite(null)).toBe(false);
    expect(isRealWebsite("")).toBe(false);
    expect(isRealWebsite("not a url")).toBe(false);
  });
});

describe("phoneKey", () => {
  it("matches the generated phone_digits column: last 9 digits", () => {
    expect(phoneKey("02 9000 0000")).toBe("290000000");
    expect(phoneKey("+61 2 9000 0000")).toBe("290000000");
  });
  it("rejects anything too short to be a real match", () => {
    expect(phoneKey("12345")).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
});

describe("screenCandidate", () => {
  it("keeps a plain candidate when no filters are set", () => {
    expect(screenCandidate(hit(), {}, nothingKnown).keep).toBe(true);
  });

  it("drops a real website under no_website", () => {
    const r = screenCandidate(hit({ website: "https://ace.com.au" }), { no_website: true }, nothingKnown);
    expect(r.keep).toBe(false);
  });

  it("keeps a Facebook-only listing under no_website", () => {
    const r = screenCandidate(
      hit({ website: "https://facebook.com/ace" }), { no_website: true }, nothingKnown);
    expect(r.keep).toBe(true);
  });

  it("applies rating and review bounds", () => {
    expect(screenCandidate(hit({ rating: 3.2 }), { min_rating: 4 }, nothingKnown).keep).toBe(false);
    expect(screenCandidate(hit({ review_count: 2 }), { min_reviews: 10 }, nothingKnown).keep).toBe(false);
    expect(screenCandidate(hit({ review_count: 900 }), { max_reviews: 100 }, nothingKnown).keep).toBe(false);
  });

  it("requires a phone when asked", () => {
    expect(screenCandidate(hit({ phone: null }), { require_phone: true }, nothingKnown).keep).toBe(false);
  });

  // Surfacing your own customer as a "prospect" is the failure that makes
  // people stop trusting the tool.
  it("drops anyone already in your contacts, by phone", () => {
    const known = { phones: new Set(["290000000"]), websites: new Set<string>() };
    const r = screenCandidate(hit(), {}, known);
    expect(r.keep).toBe(false);
    if (!r.keep) expect(r.reason).toMatch(/already/i);
  });

  it("drops anyone already in your contacts, by website host", () => {
    const known = { phones: new Set<string>(), websites: new Set(["ace.com.au"]) };
    const r = screenCandidate(hit({ website: "https://www.ace.com.au/about" }), {}, known);
    expect(r.keep).toBe(false);
  });

  it("records why it was dropped so the funnel can be explained", () => {
    const r = screenCandidate(hit({ website: "https://ace.com.au" }), { no_website: true }, nothingKnown);
    expect(r.keep).toBe(false);
    if (!r.keep) {
      expect(r.reason).toBeTruthy();
      expect(r.checks.website_is_real).toBe(true);
    }
  });
});
