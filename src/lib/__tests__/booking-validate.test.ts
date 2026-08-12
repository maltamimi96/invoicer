/**
 * The work-order times a booking generates.
 *
 * work_orders stores a NAIVE local date and time, and booking_busy_intervals
 * reads them back as `(scheduled_date + start_time) AT TIME ZONE
 * bs.timezone`. The booking route was writing `start.toISOString()` slices —
 * UTC — so for a Sydney business a 09:00 booking became a job dated the
 * previous day at 22:00 or 23:00. The crew's schedule was wrong, and the bad
 * row then blocked a 22:00 window in busy-intervals that nobody wanted.
 */
import { describe, it, expect } from "vitest";
import { workOrderTimesFor } from "@/lib/booking/validate";

describe("workOrderTimesFor", () => {
  it("keeps a Sydney morning booking on the same local day", () => {
    // 2026-03-02T09:00 Sydney (AEDT, UTC+11) === 2026-03-01T22:00Z.
    // The naive UTC slice would have said 2026-03-01 at 22:00 — a day early.
    const start = new Date("2026-03-01T22:00:00.000Z");
    const end = new Date("2026-03-01T23:00:00.000Z");
    const wo = workOrderTimesFor(start, end, "Australia/Sydney");
    expect(wo.scheduled_date).toBe("2026-03-02");
    expect(wo.start_time).toBe("09:00");
    expect(wo.end_time).toBe("10:00");
  });

  it("differs from the naive UTC slice exactly where the old bug was", () => {
    const start = new Date("2026-03-01T22:00:00.000Z");
    expect(workOrderTimesFor(start, start, "Australia/Sydney").scheduled_date)
      .not.toBe(start.toISOString().slice(0, 10));
  });

  it("handles a booking that crosses local midnight", () => {
    // 2026-06-30T23:30 Sydney (AEST, UTC+10) === 2026-06-30T13:30Z.
    const start = new Date("2026-06-30T13:30:00.000Z");
    const end = new Date("2026-06-30T14:30:00.000Z"); // 00:30 next local day
    const wo = workOrderTimesFor(start, end, "Australia/Sydney");
    expect(wo.scheduled_date).toBe("2026-06-30");
    expect(wo.start_time).toBe("23:30");
    expect(wo.end_time).toBe("00:30");
  });

  it("respects a non-Australian zone", () => {
    // 2026-01-15T08:00 London (GMT) === 08:00Z.
    const start = new Date("2026-01-15T08:00:00.000Z");
    const end = new Date("2026-01-15T09:30:00.000Z");
    const wo = workOrderTimesFor(start, end, "Europe/London");
    expect(wo.scheduled_date).toBe("2026-01-15");
    expect(wo.start_time).toBe("08:00");
    expect(wo.end_time).toBe("09:30");
  });

  it("pads single-digit months, days, hours and minutes", () => {
    const start = new Date("2026-02-03T04:05:00.000Z");
    const wo = workOrderTimesFor(start, start, "UTC");
    expect(wo.scheduled_date).toBe("2026-02-03");
    expect(wo.start_time).toBe("04:05");
  });

  it("falls back to UTC rather than throwing on an empty timezone", () => {
    const start = new Date("2026-05-05T10:00:00.000Z");
    expect(workOrderTimesFor(start, start, "").scheduled_date).toBe("2026-05-05");
  });
});
