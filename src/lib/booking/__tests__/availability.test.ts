import { describe, it, expect } from "vitest";
import { computeSlots } from "../availability";
import type { BookingSettings, AppointmentType, BookingResource } from "@/types/database";

// Use UTC so wall-clock == UTC and assertions are exact.
function settings(over: Partial<BookingSettings> = {}): BookingSettings {
  return {
    business_id: "b", enabled: true, slug: "t", timezone: "UTC",
    min_lead_minutes: 0, max_advance_days: 30, slot_granularity_minutes: 30,
    default_buffer_minutes: 0, max_per_day: null,
    require_phone: false, require_email: false, require_address: false, show_resource_names: true,
    confirmation_message: null, cancellation_window_hours: 24, reminder_offsets: [],
    create_lead: false, create_work_order: false,
    brand_logo_url: null, brand_color: null,
    captcha_provider: null, captcha_site_key: null, captcha_secret_key: null,
    webhook_url: null, webhook_secret: null,
    notify_customer_email: false, notify_customer_sms: false, notify_team_email: false, team_notify_email: null,
    created_at: "", updated_at: "", ...over,
  };
}
const type = (over: Partial<AppointmentType> = {}): AppointmentType => ({
  id: "ty", business_id: "b", name: "Inspection", description: null,
  duration_minutes: 60, buffer_minutes: null, price_display: null, color: null,
  active: true, eligible_resource_ids: [], sort_order: 0, created_at: "", updated_at: "", ...over,
});
const resource: BookingResource = {
  id: "r1", business_id: "b", member_profile_id: null, display_name: "Sam",
  active: true, sort_order: 0, created_at: "", updated_at: "",
};
// Mon 2026-06-15, 09:00–17:00 (540–1020 min).
const windows = [{
  resource,
  hours: new Map<number, { startMin: number; endMin: number }[]>([[1, [{ startMin: 540, endMin: 1020 }]]]),
  exceptions: new Map<string, { closed: boolean; startMin?: number; endMin?: number }[]>(),
}];
const DAY = "2026-06-15";
const NOW = new Date("2026-06-01T00:00:00Z"); // well before, so lead/horizon don't interfere

describe("computeSlots", () => {
  it("generates granularity-spaced slots within working hours", () => {
    const slots = computeSlots({ settings: settings(), type: type(), windows, busyByResource: new Map(), fromKey: DAY, toKey: DAY, now: NOW });
    // 09:00..16:00 step 30 = 15 slots (last start where +60min fits before 17:00)
    expect(slots.length).toBe(15);
    expect(slots[0].start).toBe("2026-06-15T09:00:00.000Z");
    expect(slots[slots.length - 1].start).toBe("2026-06-15T16:00:00.000Z");
    expect(slots[0].resource_name).toBe("Sam");
  });

  it("removes overlapping slots but keeps back-to-back (half-open)", () => {
    const busy = new Map([["r1", [{ start: Date.parse("2026-06-15T10:00:00Z"), end: Date.parse("2026-06-15T11:00:00Z") }]]]);
    const slots = computeSlots({ settings: settings(), type: type(), windows, busyByResource: busy, fromKey: DAY, toKey: DAY, now: NOW });
    const starts = slots.map((s) => s.start);
    expect(starts).not.toContain("2026-06-15T10:00:00.000Z"); // exact overlap
    expect(starts).not.toContain("2026-06-15T09:30:00.000Z"); // 09:30–10:30 overlaps
    expect(starts).not.toContain("2026-06-15T10:30:00.000Z"); // 10:30–11:30 overlaps
    expect(starts).toContain("2026-06-15T11:00:00.000Z");     // back-to-back is allowed
    expect(starts).toContain("2026-06-15T09:00:00.000Z");     // 09:00–10:00 back-to-back before
  });

  it("expands the exclusion zone by the buffer on both sides", () => {
    const busy = new Map([["r1", [{ start: Date.parse("2026-06-15T10:00:00Z"), end: Date.parse("2026-06-15T11:00:00Z") }]]]);
    const slots = computeSlots({ settings: settings(), type: type({ buffer_minutes: 15 }), windows, busyByResource: busy, fromKey: DAY, toKey: DAY, now: NOW });
    const starts = slots.map((s) => s.start);
    // With a 15-min buffer, the 11:00 slot's guard (10:45) now overlaps the busy block.
    expect(starts).not.toContain("2026-06-15T11:00:00.000Z");
    expect(starts).toContain("2026-06-15T11:30:00.000Z");
  });

  it("respects min_lead_minutes", () => {
    const now = new Date("2026-06-15T09:30:00Z"); // same day, 09:30
    const slots = computeSlots({ settings: settings({ min_lead_minutes: 60 }), type: type(), windows, busyByResource: new Map(), fromKey: DAY, toKey: DAY, now });
    const starts = slots.map((s) => s.start);
    expect(starts).not.toContain("2026-06-15T09:00:00.000Z");
    expect(starts).not.toContain("2026-06-15T10:00:00.000Z"); // earliest = 10:30
    expect(starts).toContain("2026-06-15T10:30:00.000Z");
  });

  it("respects max_per_day", () => {
    const slots = computeSlots({ settings: settings({ max_per_day: 3 }), type: type(), windows, busyByResource: new Map(), fromKey: DAY, toKey: DAY, now: NOW });
    expect(slots.length).toBe(3);
  });

  it("returns nothing on a closed exception day", () => {
    const closed = [{
      resource,
      hours: windows[0].hours,
      exceptions: new Map([[DAY, [{ closed: true }]]]),
    }];
    const slots = computeSlots({ settings: settings(), type: type(), windows: closed, busyByResource: new Map(), fromKey: DAY, toKey: DAY, now: NOW });
    expect(slots.length).toBe(0);
  });
});
