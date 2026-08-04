import { describe, it, expect } from "vitest";
import {
  buildPeriod, financialYearOf, addDays, daysInMonth, monthsBetween,
} from "@/lib/expenses/period";

describe("Australian financial year", () => {
  it("runs 1 July to 30 June, not Jan–Dec", () => {
    // The whole reason this module exists: a generic calendar year reports the
    // wrong number for half of every year.
    const fy = financialYearOf("2026-08-04");
    expect(fy.start).toBe("2026-07-01");
    expect(fy.end).toBe("2027-06-30");
    expect(fy.label).toBe("FY 2026/27");
  });

  it("puts January in the FY that began the previous July", () => {
    const fy = financialYearOf("2027-01-15");
    expect(fy.start).toBe("2026-07-01");
    expect(fy.label).toBe("FY 2026/27");
  });

  it("handles both boundary days", () => {
    expect(financialYearOf("2026-06-30").label).toBe("FY 2025/26");
    expect(financialYearOf("2026-07-01").label).toBe("FY 2026/27");
  });
});

describe("period building", () => {
  const anchor = "2026-08-04"; // a Tuesday

  it("builds a single day", () => {
    const p = buildPeriod("day", anchor);
    expect([p.start, p.end]).toEqual(["2026-08-04", "2026-08-04"]);
  });

  it("starts weeks on Monday", () => {
    const p = buildPeriod("week", anchor);
    expect(p.start).toBe("2026-08-03");
    expect(p.end).toBe("2026-08-09");
  });

  it("treats Sunday as the END of its week, not the start", () => {
    // The classic off-by-one: Sunday belongs to the week that just finished.
    const p = buildPeriod("week", "2026-08-09");
    expect(p.start).toBe("2026-08-03");
    expect(p.end).toBe("2026-08-09");
  });

  it("builds a calendar month and gets its last day right", () => {
    expect(buildPeriod("month", anchor).start).toBe("2026-08-01");
    expect(buildPeriod("month", anchor).end).toBe("2026-08-31");
    expect(buildPeriod("month", "2026-02-10").end).toBe("2026-02-28");
    expect(buildPeriod("month", "2028-02-10").end).toBe("2028-02-29"); // leap
  });

  it("uses BAS quarters (Jul–Sep is Q1), not calendar quarters", () => {
    const q1 = buildPeriod("quarter", "2026-08-04");
    expect([q1.start, q1.end]).toEqual(["2026-07-01", "2026-09-30"]);

    const q3 = buildPeriod("quarter", "2027-02-10");
    expect([q3.start, q3.end]).toEqual(["2027-01-01", "2027-03-31"]);
  });

  it("steps backwards and forwards without drifting", () => {
    expect(buildPeriod("month", anchor, -1).start).toBe("2026-07-01");
    expect(buildPeriod("month", "2026-01-15", -1).start).toBe("2025-12-01"); // year boundary
    expect(buildPeriod("month", "2026-12-15", 1).start).toBe("2027-01-01");
    expect(buildPeriod("fy", anchor, -1).label).toBe("FY 2025/26");
    expect(buildPeriod("quarter", "2026-08-04", -1).start).toBe("2026-04-01");
    expect(buildPeriod("quarter", "2026-08-04", 1).start).toBe("2026-10-01");
  });

  it("wraps quarters across the financial-year boundary", () => {
    // Q4 (Apr–Jun) + 1 must land on Q1 of the NEXT financial year.
    const next = buildPeriod("quarter", "2027-05-10", 1);
    expect([next.start, next.end]).toEqual(["2027-07-01", "2027-09-30"]);
  });
});

describe("date helpers", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap
  });

  it("counts days in a month", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 8)).toBe(31);
  });

  it("lists months in a range, capped so a chart stays readable", () => {
    const m = monthsBetween("2026-07-01", "2026-09-30");
    expect(m.map((x) => x.label)).toEqual(["Jul 26", "Aug 26", "Sep 26"]);
    expect(m[0].end).toBe("2026-07-31");
    expect(monthsBetween("1900-01-01", "2999-12-31").length).toBe(24);
  });
});
