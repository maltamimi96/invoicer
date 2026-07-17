import { describe, it, expect } from "vitest";
import { planDates, cadenceDays, isCadence } from "../schedule";

describe("cadenceDays", () => {
  it("maps the known cadences", () => {
    expect(cadenceDays("daily")).toBe(1);
    expect(cadenceDays("weekly")).toBe(7);
    expect(cadenceDays("fortnightly")).toBe(14);
  });

  it("falls back to weekly rather than throwing", () => {
    // A campaign with a bad cadence should still plan — conservatively.
    expect(cadenceDays("wat")).toBe(7);
    expect(cadenceDays(null)).toBe(7);
    expect(cadenceDays(undefined)).toBe(7);
  });
});

describe("planDates", () => {
  it("starts on the start date", () => {
    expect(planDates("2026-07-17", "weekly", 1)).toEqual(["2026-07-17"]);
  });

  it("steps by the cadence", () => {
    expect(planDates("2026-07-01", "weekly", 3)).toEqual(["2026-07-01", "2026-07-08", "2026-07-15"]);
    expect(planDates("2026-07-01", "daily", 3)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
  });

  it("rolls over month and year boundaries", () => {
    // setUTCDate handles overflow; this is the assertion that proves it.
    expect(planDates("2026-12-28", "weekly", 2)).toEqual(["2026-12-28", "2027-01-04"]);
    expect(planDates("2026-01-31", "every_2_days", 2)).toEqual(["2026-01-31", "2026-02-02"]);
  });

  it("handles a leap day", () => {
    expect(planDates("2028-02-28", "daily", 2)).toEqual(["2028-02-28", "2028-02-29"]);
  });

  it("returns nothing for a zero or negative count", () => {
    expect(planDates("2026-07-17", "weekly", 0)).toEqual([]);
    expect(planDates("2026-07-17", "weekly", -3)).toEqual([]);
  });

  it("rejects a start date it can't parse", () => {
    expect(() => planDates("not-a-date", "weekly", 2)).toThrow(/valid start date/);
  });
});

describe("isCadence", () => {
  it("gates untrusted input", () => {
    expect(isCadence("weekly")).toBe(true);
    expect(isCadence("hourly")).toBe(false);
    expect(isCadence(7)).toBe(false);
    expect(isCadence(null)).toBe(false);
  });
});
