import { describe, it, expect } from "vitest";
import { nextDueDate, dueDatesUpTo, validateSchedule } from "./expense-schedule";

describe("nextDueDate", () => {
  it("clamps to the last day of a short month instead of spilling over", () => {
    // The bug this file exists to avoid: JS `setMonth` turns 31 Jan into
    // 3 March. Rent due on the 31st would land in the wrong month every
    // February, forever.
    expect(nextDueDate("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(nextDueDate("2028-01-31", "monthly", 31)).toBe("2028-02-29"); // leap year
    expect(nextDueDate("2026-03-31", "monthly", 31)).toBe("2026-04-30");
  });

  it("returns to the preferred day after a clamped month", () => {
    // February clamped it to the 28th; March must go back to the 31st, not
    // stay on the 28th forever.
    expect(nextDueDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
  });

  it("rolls the year over in December", () => {
    expect(nextDueDate("2026-12-15", "monthly", 15)).toBe("2027-01-15");
    expect(nextDueDate("2026-11-30", "quarterly", 30)).toBe("2027-02-28");
  });

  it("handles the day-based cadences", () => {
    expect(nextDueDate("2026-08-10", "weekly")).toBe("2026-08-17");
    expect(nextDueDate("2026-08-10", "fortnightly")).toBe("2026-08-24");
    expect(nextDueDate("2026-12-28", "weekly")).toBe("2027-01-04");
  });

  it("does yearly, which insurance needs", () => {
    expect(nextDueDate("2026-06-01", "yearly", 1)).toBe("2027-06-01");
    expect(nextDueDate("2028-02-29", "yearly", 29)).toBe("2029-02-28");
  });

  it("keeps the current day when no preference is set", () => {
    expect(nextDueDate("2026-08-10", "monthly")).toBe("2026-09-10");
  });

  it("refuses a malformed date rather than inventing one", () => {
    expect(() => nextDueDate("not-a-date", "monthly")).toThrow();
  });
});

describe("dueDatesUpTo", () => {
  it("catches up a schedule the runner missed", () => {
    // A cron outage must not silently skip months of rent.
    const dates = dueDatesUpTo("2026-05-01", "2026-08-01", "monthly", 1);
    expect(dates).toEqual(["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"]);
  });

  it("returns nothing when nothing is due yet", () => {
    expect(dueDatesUpTo("2026-09-01", "2026-08-10", "monthly", 1)).toEqual([]);
  });

  it("bounds the catch-up so a stale schedule can't post hundreds of rows", () => {
    const dates = dueDatesUpTo("2020-01-01", "2026-08-10", "monthly", 1, 12);
    expect(dates).toHaveLength(12);
  });
});

describe("validateSchedule", () => {
  it("requires a name, a positive amount and a start date", () => {
    expect(validateSchedule({ amount: 10, next_run_on: "2026-08-10" })).toMatch(/name/i);
    expect(validateSchedule({ name: "Rent", amount: 0, next_run_on: "2026-08-10" })).toMatch(/greater than zero/i);
    expect(validateSchedule({ name: "Rent", amount: 10 })).toMatch(/next falls due/i);
  });

  it("rejects an end date before the first charge", () => {
    expect(validateSchedule({
      name: "Rent", amount: 10, next_run_on: "2026-08-10", ends_on: "2026-01-01",
    })).toMatch(/before the first charge/i);
  });

  it("accepts a sound schedule", () => {
    expect(validateSchedule({
      name: "Office rent", amount: 2200, next_run_on: "2026-09-01",
      preferred_day_of_month: 1, ends_on: "2027-09-01",
    })).toBeNull();
  });
});
