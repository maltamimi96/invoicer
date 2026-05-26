/**
 * Booking availability engine.
 *
 * Produces bookable slot start-times for an appointment type across a date
 * range, in the business's timezone, by:
 *   working_hours  −  availability_exceptions  −  busy intervals
 *   (existing appointments + live holds + scheduled work_orders, all from the
 *    booking_busy_intervals SECURITY DEFINER fn)  −  buffers on both sides
 * then applying min_lead_minutes, max_advance_days, slot_granularity_minutes
 * and max_per_day.
 *
 * Times in / out are UTC ISO strings. DST is handled by src/lib/booking/time.ts.
 */
import type {
  BookingSettings, AppointmentType, BookingResource, BookingSlot,
} from "@/types/database";
import {
  zonedWallToUtc, utcToZonedParts, zonedDateKey, addDaysKey,
  timeToMinutes, weekdayForDate,
} from "./time";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

interface Interval { start: number; end: number } // epoch ms

interface ResourceWindows {
  resource: BookingResource;
  // working hours per weekday (0..6) → list of {startMin,endMin}
  hours: Map<number, { startMin: number; endMin: number }[]>;
  // exceptions by dateKey → closed | custom window(s)
  exceptions: Map<string, { closed: boolean; startMin?: number; endMin?: number }[]>;
}

/** Load everything the engine needs for one appointment type. */
export async function loadAvailabilityData(sb: Sb, businessId: string, appointmentTypeId: string) {
  const [{ data: settings }, { data: type }] = await Promise.all([
    sb.from("booking_settings").select("*").eq("business_id", businessId).maybeSingle(),
    sb.from("appointment_types").select("*").eq("id", appointmentTypeId).eq("business_id", businessId).maybeSingle(),
  ]);
  if (!settings || !type || !type.active) return null;

  // Eligible resources: explicit list on the type, else all active resources.
  const eligible: string[] = type.eligible_resource_ids ?? [];
  let resQuery = sb.from("booking_resources").select("*").eq("business_id", businessId).eq("active", true);
  if (eligible.length > 0) resQuery = resQuery.in("id", eligible);
  const { data: resources } = await resQuery.order("sort_order", { ascending: true });

  const resourceIds: string[] = (resources ?? []).map((r: BookingResource) => r.id);
  if (resourceIds.length === 0) {
    return { settings: settings as BookingSettings, type: type as AppointmentType, windows: [] as ResourceWindows[] };
  }

  const [{ data: hours }, { data: exceptions }] = await Promise.all([
    sb.from("booking_working_hours").select("*").in("resource_id", resourceIds),
    sb.from("booking_availability_exceptions").select("*").eq("business_id", businessId),
  ]);

  const windows: ResourceWindows[] = (resources as BookingResource[]).map((resource) => {
    const hMap = new Map<number, { startMin: number; endMin: number }[]>();
    for (const h of (hours ?? []).filter((x: { resource_id: string }) => x.resource_id === resource.id)) {
      const arr = hMap.get(h.weekday) ?? [];
      arr.push({ startMin: timeToMinutes(h.start_time), endMin: timeToMinutes(h.end_time) });
      hMap.set(h.weekday, arr);
    }
    const eMap = new Map<string, { closed: boolean; startMin?: number; endMin?: number }[]>();
    for (const e of (exceptions ?? [])) {
      // resource_id NULL = whole business; else must match this resource.
      if (e.resource_id && e.resource_id !== resource.id) continue;
      const arr = eMap.get(e.date) ?? [];
      arr.push(e.is_closed
        ? { closed: true }
        : { closed: false, startMin: timeToMinutes(e.start_time), endMin: timeToMinutes(e.end_time) });
      eMap.set(e.date, arr);
    }
    return { resource, hours: hMap, exceptions: eMap };
  });

  return { settings: settings as BookingSettings, type: type as AppointmentType, windows };
}

/** Pure slot computation given loaded data + busy intervals per resource. */
export function computeSlots(args: {
  settings: BookingSettings;
  type: AppointmentType;
  windows: ResourceWindows[];
  busyByResource: Map<string, Interval[]>;
  fromKey: string;   // inclusive 'YYYY-MM-DD' (business tz)
  toKey: string;     // inclusive
  now: Date;
  perDayCount?: Map<string, number>; // existing appt count per dateKey (for max_per_day)
}): BookingSlot[] {
  const { settings, type, windows, busyByResource, fromKey, toKey, now } = args;
  const tz = settings.timezone;
  const durationMin = type.duration_minutes;
  const bufferMin = type.buffer_minutes ?? settings.default_buffer_minutes ?? 0;
  const granularity = settings.slot_granularity_minutes;
  const minLeadMs = settings.min_lead_minutes * 60_000;
  const earliest = now.getTime() + minLeadMs;

  // Horizon clamp.
  const horizonKey = addDaysKey(zonedDateKey(now, tz), settings.max_advance_days);
  const effectiveTo = toKey < horizonKey ? toKey : horizonKey;

  const perDay = args.perDayCount ?? new Map<string, number>();
  // Collapse by slot start so the customer sees one entry per time (first free resource).
  const byStart = new Map<string, BookingSlot>();

  for (let dateKey = fromKey; dateKey <= effectiveTo; dateKey = addDaysKey(dateKey, 1)) {
    const [yy, mm, dd] = dateKey.split("-").map(Number);
    const weekday = weekdayForDate(dateKey);

    // max_per_day gate (counts existing appts that day).
    if (settings.max_per_day != null && (perDay.get(dateKey) ?? 0) >= settings.max_per_day) continue;
    let daySlotsAdded = 0;
    const dayBudget = settings.max_per_day != null
      ? settings.max_per_day - (perDay.get(dateKey) ?? 0) : Infinity;

    for (const w of windows) {
      const exForDay = w.exceptions.get(dateKey);
      const closedAllDay = exForDay?.some((e) => e.closed);
      if (closedAllDay) continue;

      // Effective open windows: exception custom windows override working hours.
      const customWindows = exForDay?.filter((e) => !e.closed && e.startMin != null) ?? [];
      const baseWindows = customWindows.length > 0
        ? customWindows.map((e) => ({ startMin: e.startMin!, endMin: e.endMin! }))
        : (w.hours.get(weekday) ?? []);
      if (baseWindows.length === 0) continue;

      const busy = busyByResource.get(w.resource.id) ?? [];

      for (const win of baseWindows) {
        // Walk candidate starts at granularity within the open window.
        for (let startMin = win.startMin; startMin + durationMin <= win.endMin; startMin += granularity) {
          const slotStart = zonedWallToUtc(yy, mm, dd, Math.floor(startMin / 60), startMin % 60, tz);
          const slotEnd = new Date(slotStart.getTime() + durationMin * 60_000);

          if (slotStart.getTime() < earliest) continue;

          // Buffer expands the candidate's exclusion zone on both sides.
          const guardStart = slotStart.getTime() - bufferMin * 60_000;
          const guardEnd = slotEnd.getTime() + bufferMin * 60_000;
          const overlaps = busy.some((b) => b.start < guardEnd && b.end > guardStart);
          if (overlaps) continue;

          const key = slotStart.toISOString();
          if (byStart.has(key)) continue; // already have a resource for this time
          if (daySlotsAdded >= dayBudget) break;

          byStart.set(key, {
            start: key,
            end: slotEnd.toISOString(),
            resource_id: w.resource.id,
            resource_name: w.resource.display_name,
          });
          daySlotsAdded++;
        }
      }
    }
  }

  return [...byStart.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/** Orchestrator: load data, pull busy intervals per resource, compute slots. */
export async function getAvailability(
  sb: Sb, businessId: string, appointmentTypeId: string, fromKey: string, toKey: string,
  resourceId?: string | null,
): Promise<{ slots: BookingSlot[]; timezone: string } | null> {
  const data = await loadAvailabilityData(sb, businessId, appointmentTypeId);
  if (!data) return null;
  const { settings, type } = data;
  // Optionally narrow to a single chosen resource/worker.
  const windows = resourceId ? data.windows.filter((w) => w.resource.id === resourceId) : data.windows;

  // Query window in UTC: pad a day on each side to catch tz/buffer edges.
  const fromUtc = zonedWallToUtc(...dateParts(addDaysKey(fromKey, -1)), 0, 0, settings.timezone);
  const toUtc = zonedWallToUtc(...dateParts(addDaysKey(toKey, 2)), 0, 0, settings.timezone);

  const busyByResource = new Map<string, Interval[]>();
  await Promise.all(windows.map(async (w) => {
    const { data: rows } = await sb.rpc("booking_busy_intervals", {
      p_business_id: businessId,
      p_resource_id: w.resource.id,
      p_from: fromUtc.toISOString(),
      p_to: toUtc.toISOString(),
    });
    busyByResource.set(w.resource.id, (rows ?? []).map((r: { starts_at: string; ends_at: string }) => ({
      start: new Date(r.starts_at).getTime(),
      end: new Date(r.ends_at).getTime(),
    })));
  }));

  const slots = computeSlots({
    settings, type, windows, busyByResource, fromKey, toKey, now: new Date(),
  });
  return { slots, timezone: settings.timezone };
}

/** Helper: 'YYYY-MM-DD' → [year, month, day] tuple for zonedWallToUtc spreads. */
function dateParts(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}

/** Used by the booking endpoint to re-validate a chosen slot is still bookable
 *  for a specific resource (defence-in-depth before the exclusion-guarded insert). */
export function utcToLocalLabel(iso: string, tz: string): string {
  const p = utcToZonedParts(new Date(iso), tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")} ` +
    `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
