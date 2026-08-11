import { describe, it, expect } from "vitest";
import { boundingBox, distanceM, withinRadius, type SearchArea, type PlaceHit } from "../places";

// Parramatta-ish, which is where a Sydney hunt actually centres.
const area: SearchArea = { lat: -33.8148, lng: 151.0017, radiusM: 10_000 };

function hit(lat: number | null, lng: number | null): PlaceHit {
  return {
    place_id: "p", name: "n", address: null, phone: null, website: null,
    category: null, rating: null, review_count: null, lat, lng, raw: {},
  };
}

describe("boundingBox", () => {
  // Text Search's locationRestriction takes a rectangle only — a circle is a
  // 400, which is what broke every hunt before this existed.
  it("produces a rectangle that contains the circle", () => {
    const box = boundingBox(area);
    expect(box.low.latitude).toBeLessThan(area.lat);
    expect(box.high.latitude).toBeGreaterThan(area.lat);
    expect(box.low.longitude).toBeLessThan(area.lng);
    expect(box.high.longitude).toBeGreaterThan(area.lng);

    // Each edge sits ~radius away from the centre.
    const north = distanceM({ lat: area.lat, lng: area.lng }, { lat: box.high.latitude, lng: area.lng });
    expect(north).toBeGreaterThan(9_000);
    expect(north).toBeLessThan(11_000);
  });

  it("clamps to Places' 50km ceiling", () => {
    const huge = boundingBox({ lat: 0, lng: 0, radiusM: 500_000 });
    const north = distanceM({ lat: 0, lng: 0 }, { lat: huge.high.latitude, lng: 0 });
    expect(north).toBeLessThan(51_000);
  });

  it("stays inside legal coordinates near a pole", () => {
    const box = boundingBox({ lat: 89.9, lng: 179.9, radiusM: 50_000 });
    expect(box.high.latitude).toBeLessThanOrEqual(90);
    expect(box.low.latitude).toBeGreaterThanOrEqual(-90);
    expect(box.high.longitude).toBeLessThanOrEqual(180);
    expect(box.low.longitude).toBeGreaterThanOrEqual(-180);
  });
});

describe("withinRadius", () => {
  it("keeps a result at the centre", () => {
    expect(withinRadius(hit(area.lat, area.lng), area)).toBe(true);
  });

  // The whole reason this function exists: the box's corners reach radius×√2,
  // so without it a "10km" hunt returns businesses 14km away.
  it("drops a corner of the bounding box that is outside the circle", () => {
    const box = boundingBox(area);
    const corner = hit(box.high.latitude, box.high.longitude);
    expect(distanceM({ lat: area.lat, lng: area.lng },
      { lat: box.high.latitude, lng: box.high.longitude })).toBeGreaterThan(area.radiusM);
    expect(withinRadius(corner, area)).toBe(false);
  });

  it("keeps a result just inside the edge", () => {
    const box = boundingBox(area);
    expect(withinRadius(hit(box.high.latitude - 0.001, area.lng), area)).toBe(true);
  });

  // Losing a real business over a missing field is the worse error.
  it("keeps a result with no coordinates", () => {
    expect(withinRadius(hit(null, null), area)).toBe(true);
  });
});

describe("distanceM", () => {
  it("matches a known distance (Sydney CBD → Parramatta ≈ 23km)", () => {
    const d = distanceM({ lat: -33.8688, lng: 151.2093 }, { lat: -33.8148, lng: 151.0017 });
    expect(d).toBeGreaterThan(19_000);
    expect(d).toBeLessThan(25_000);
  });
});
