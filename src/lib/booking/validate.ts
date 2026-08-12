/**
 * Is this actually a slot the business offered?
 *
 * The public booking endpoints used to take `start` from the request body,
 * derive `end` from the appointment type's duration, and insert. The exclusion
 * constraint stopped double-booking and nothing else — so a crafted POST could
 * put a job at 4am, on a blackout day, in the past, or months past
 * max_advance_days, and the owner found it on the calendar.
 *
 * This validates by re-running the SAME availability engine that produced the
 * slots the customer was offered and checking the requested instant is one of
 * them. Re-deriving the rules here would be a second implementation free to
 * drift from the one the widget renders, which is how the gap opened in the
 * first place: getAvailability had exactly one caller, the availability
 * endpoint.
 *
 * It also inherits the form's appointment_type_ids / resource_ids restriction
 * for free, because loadAvailabilityData applies it and returns null when the
 * type isn't one this form may book.
 */

import { getAvailability } from "./availability";
import { zonedDateKey, utcToZonedParts } from "./time";
import type { BookingForm } from "@/types/database";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The scheduled_date / start_time / end_time a work order should carry for a
 * booking, in the business's own wall-clock.
 *
 * work_orders stores a naive local date and time — the booking_busy_intervals
 * SQL reads them back as `(scheduled_date + start_time) AT TIME ZONE
 * bs.timezone`. The booking route was writing `start.toISOString()` slices,
 * i.e. UTC, so for a Sydney business a 09:00 booking became a job dated the
 * PREVIOUS day at 22:00 or 23:00. The crew's schedule was wrong, and the bad
 * row fed back into busy-intervals to block a 22:00 window nobody wanted.
 */
export function workOrderTimesFor(start: Date, end: Date, timezone: string): {
  scheduled_date: string; start_time: string; end_time: string;
} {
  const tz = timezone || "UTC";
  const s = utcToZonedParts(start, tz);
  const e = utcToZonedParts(end, tz);
  return {
    scheduled_date: `${s.year}-${pad(s.month)}-${pad(s.day)}`,
    start_time: `${pad(s.hour)}:${pad(s.minute)}`,
    end_time: `${pad(e.hour)}:${pad(e.minute)}`,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export type SlotCheck = { ok: true } | { ok: false; reason: string };

export async function isSlotBookable(
  sb: Sb,
  form: BookingForm,
  typeId: string,
  resourceId: string,
  start: Date,
): Promise<SlotCheck> {
  if (isNaN(start.getTime())) return { ok: false, reason: "Invalid start time" };

  // A slot in the past is never bookable, whatever the calendar says. Checked
  // before the engine so an empty result for a past day reads correctly.
  if (start.getTime() <= Date.now()) {
    return { ok: false, reason: "That time is in the past" };
  }

  let avail: Awaited<ReturnType<typeof getAvailability>>;
  try {
    // The business's own timezone decides which local day this instant is on —
    // getting that wrong would ask for the wrong day's slots and reject a
    // perfectly good booking near midnight.
    const { data: bs } = await sb.from("booking_settings")
      .select("timezone").eq("business_id", form.business_id).maybeSingle();
    const dayKey = zonedDateKey(start, bs?.timezone || "UTC");
    // A single local day. getAvailability pads its own query window, so
    // timezone and buffer edges are already handled inside it.
    avail = await getAvailability(sb, form, typeId, dayKey, dayKey, resourceId);
  } catch {
    // Never fail open: if availability can't be computed we don't know that
    // this slot is legitimate, and guessing yes is what created the hole.
    return { ok: false, reason: "Could not verify that time" };
  }

  if (!avail) return { ok: false, reason: "That appointment type isn't available on this form" };

  const wanted = start.getTime();
  const match = avail.slots.some(
    (s) => s.resource_id === resourceId && new Date(s.start).getTime() === wanted,
  );
  return match ? { ok: true } : { ok: false, reason: "That time is no longer available" };
}
