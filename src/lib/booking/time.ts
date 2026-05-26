/**
 * DST-correct timezone helpers for the booking engine — no external tz library.
 *
 * Strategy: use Intl.DateTimeFormat with a timeZone to read what wall-clock a
 * given UTC instant maps to, then invert that to convert a wall-clock time in a
 * business's timezone back to a precise UTC instant — refining once so we land
 * correctly across DST boundaries.
 *
 * All persisted times are UTC (timestamptz). We only ever convert at the edges:
 * working-hours (local TIME) → UTC instants for availability, and UTC instants
 * → local parts for rendering/validation.
 */

/** Milliseconds the given instant is offset from UTC in `tz` (e.g. +11h for
 *  Sydney in summer). Positive means ahead of UTC. */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const m: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = Number(p.value);
  // Intl renders hour 24 for midnight in some envs; normalise.
  const hour = m.hour === 24 ? 0 : m.hour;
  const asUtc = Date.UTC(m.year, m.month - 1, m.day, hour, m.minute, m.second);
  return asUtc - instant.getTime();
}

/**
 * Convert a wall-clock time in `tz` to the precise UTC Date.
 * @param y full year, @param mo 1-12, @param d 1-31, @param h 0-23, @param mi 0-59
 */
export function zonedWallToUtc(
  y: number, mo: number, d: number, h: number, mi: number, tz: string,
): Date {
  // Treat the wall components as if they were UTC, then subtract the tz offset.
  const guessMs = Date.UTC(y, mo - 1, d, h, mi, 0);
  // First approximation using the offset at the guessed instant.
  let utcMs = guessMs - tzOffsetMs(new Date(guessMs), tz);
  // Refine once: re-evaluate the offset at the candidate instant (handles the
  // case where the guess fell on the wrong side of a DST transition).
  utcMs = guessMs - tzOffsetMs(new Date(utcMs), tz);
  return new Date(utcMs);
}

export interface ZonedParts {
  year: number; month: number; day: number;
  hour: number; minute: number; weekday: number; // 0=Sun..6=Sat
}

/** Break a UTC instant into wall-clock parts in `tz`. */
export function utcToZonedParts(instant: Date, tz: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = m.hour === "24" ? 0 : Number(m.hour);
  return {
    year: Number(m.year), month: Number(m.month), day: Number(m.day),
    hour, minute: Number(m.minute), weekday: WD[m.weekday] ?? 0,
  };
}

/** 'YYYY-MM-DD' for a UTC instant rendered in `tz`. */
export function zonedDateKey(instant: Date, tz: string): string {
  const p = utcToZonedParts(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Parse 'HH:MM' or 'HH:MM:SS' → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Weekday (0=Sun..6=Sat) for a 'YYYY-MM-DD' date string, tz-independent (uses noon UTC to avoid edges). */
export function weekdayForDate(dateKey: string): number {
  const [y, mo, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)).getUTCDay();
}

/** Add days to a 'YYYY-MM-DD' key, returning a new key. */
export function addDaysKey(dateKey: string, days: number): string {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
