import { describe, it, expect } from "vitest";
import {
  zonedWallToUtc, utcToZonedParts, zonedDateKey, timeToMinutes,
  weekdayForDate, addDaysKey,
} from "../time";

const SYD = "Australia/Sydney";

describe("zonedWallToUtc — DST correctness", () => {
  it("converts AEST (winter, UTC+10) wall time to UTC", () => {
    // 1 Jul 2026 12:00 Sydney (AEST) = 02:00 UTC same day
    expect(zonedWallToUtc(2026, 7, 1, 12, 0, SYD).toISOString()).toBe("2026-07-01T02:00:00.000Z");
  });

  it("converts AEDT (summer, UTC+11) wall time to UTC", () => {
    // 15 Jan 2026 12:00 Sydney (AEDT) = 01:00 UTC same day
    expect(zonedWallToUtc(2026, 1, 15, 12, 0, SYD).toISOString()).toBe("2026-01-15T01:00:00.000Z");
  });

  it("applies a different offset on each side of the Oct DST transition", () => {
    // AEST→AEDT clocks forward 2am→3am on Sun 4 Oct 2026.
    const beforeTransition = zonedWallToUtc(2026, 10, 1, 12, 0, SYD); // AEST +10 → 02:00Z
    const afterTransition = zonedWallToUtc(2026, 10, 8, 12, 0, SYD);  // AEDT +11 → 01:00Z
    expect(beforeTransition.toISOString()).toBe("2026-10-01T02:00:00.000Z");
    expect(afterTransition.toISOString()).toBe("2026-10-08T01:00:00.000Z");
  });

  it("round-trips wall → UTC → wall", () => {
    const utc = zonedWallToUtc(2026, 3, 20, 9, 30, SYD);
    const parts = utcToZonedParts(utc, SYD);
    expect([parts.year, parts.month, parts.day, parts.hour, parts.minute]).toEqual([2026, 3, 20, 9, 30]);
  });

  it("handles a UTC timezone identity", () => {
    expect(zonedWallToUtc(2026, 6, 15, 8, 0, "UTC").toISOString()).toBe("2026-06-15T08:00:00.000Z");
  });
});

describe("date/weekday helpers", () => {
  it("timeToMinutes parses HH:MM[:SS]", () => {
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("17:30:00")).toBe(1050);
  });
  it("weekdayForDate is 0=Sun..6=Sat", () => {
    expect(weekdayForDate("2026-05-25")).toBe(1); // Monday
    expect(weekdayForDate("2026-05-24")).toBe(0); // Sunday
  });
  it("addDaysKey rolls months/years", () => {
    expect(addDaysKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysKey("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("zonedDateKey renders the local date for an instant", () => {
    // 2026-06-30T23:00Z is 1 Jul 2026 09:00 in Sydney (AEST)
    expect(zonedDateKey(new Date("2026-06-30T23:00:00Z"), SYD)).toBe("2026-07-01");
  });
});
