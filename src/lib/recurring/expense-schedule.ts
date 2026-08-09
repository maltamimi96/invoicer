/**
 * When a recurring cost next falls due.
 *
 * Plain module: the form validates with it, the cron advances with it, and
 * tests exercise it without a database.
 *
 * ⚠️ This does NOT reuse `advanceOccurrence` from ./cadence.ts, deliberately.
 * That helper does `d.setMonth(d.getMonth() + 1)`, which turns 31 January into
 * 3 March — JavaScript rolls the overflow forward instead of clamping. For a
 * weekly job that never shows; for rent due on the 31st it silently moves the
 * charge into the wrong month, every short month, forever. It also has no
 * `yearly`, which insurance needs.
 *
 * (The same rollover affects recurring JOBS today. Flagged, not changed here —
 * altering it would move existing schedules without anyone asking.)
 */

export type ExpenseCadence = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

export const EXPENSE_CADENCES: Array<{ value: ExpenseCadence; label: string }> = [
  { value: "weekly", label: "Every week" },
  { value: "fortnightly", label: "Every fortnight" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every quarter" },
  { value: "yearly", label: "Every year" },
];

/** Days in a given month. `month` is 0-indexed, as in the Date API. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * The next due date after `current`.
 *
 * @param preferredDay  the day of the month a monthly-or-longer schedule
 *                      should land on. 31 lands on the last day of a short
 *                      month rather than spilling into the next one — which
 *                      is what someone means by "the 31st".
 */
export function nextDueDate(
  current: string,
  cadence: ExpenseCadence,
  preferredDay?: number | null,
): string {
  const [y, m, d] = current.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Bad date: ${current}`);

  // Day-based cadences are unambiguous — no month lengths involved.
  if (cadence === "weekly" || cadence === "fortnightly") {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + (cadence === "weekly" ? 7 : 14));
    return dt.toISOString().slice(0, 10);
  }

  const step = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;
  // Work in absolute months so December + 1 rolls the year properly.
  const absolute = (y * 12 + (m - 1)) + step;
  const year = Math.floor(absolute / 12);
  const month = absolute % 12;

  const wanted = preferredDay && preferredDay >= 1 && preferredDay <= 31 ? preferredDay : d;
  const day = Math.min(wanted, daysInMonth(year, month));

  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Every due date from `from` up to and including `until`.
 *
 * The cron uses this so a schedule that was missed — a cron outage, a
 * business created while the runner was down — catches up rather than
 * silently skipping months. Bounded, because an `active` schedule whose
 * next_run_on is years stale would otherwise generate hundreds of rows.
 */
export function dueDatesUpTo(
  nextRunOn: string,
  until: string,
  cadence: ExpenseCadence,
  preferredDay?: number | null,
  maxCatchUp = 12,
): string[] {
  const out: string[] = [];
  let cursor = nextRunOn;
  while (cursor <= until && out.length < maxCatchUp) {
    out.push(cursor);
    cursor = nextDueDate(cursor, cadence, preferredDay);
  }
  return out;
}

/** What's wrong with this schedule, or null when it's fine. */
export function validateSchedule(input: {
  name?: string | null;
  amount?: number | string | null;
  next_run_on?: string | null;
  ends_on?: string | null;
  preferred_day_of_month?: number | null;
}): string | null {
  if (!(input.name ?? "").trim()) return "Give it a name — “Office rent”, “Xero”, “Public liability”.";

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return "Enter an amount greater than zero.";

  if (!input.next_run_on) return "Choose when it next falls due.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.next_run_on)) return "That start date isn't valid.";

  if (input.ends_on && input.ends_on < input.next_run_on) {
    return "The end date is before the first charge.";
  }
  const day = input.preferred_day_of_month;
  if (day != null && (day < 1 || day > 31)) return "Day of the month must be between 1 and 31.";
  return null;
}
