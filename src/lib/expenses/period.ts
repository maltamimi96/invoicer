/**
 * Period maths for the books.
 *
 * The one thing worth getting right here: the Australian financial year runs
 * 1 July – 30 June, not January – December. Every "this year" figure a tradie
 * cares about — BAS, tax, the number their accountant asks for — is on that
 * calendar, so a generic Jan–Dec "year" would quietly report the wrong number
 * for six months of every year.
 *
 * Dates are handled as plain yyyy-mm-dd strings, matching `expenses.spent_on`
 * (a DATE column). Constructing Date objects for comparison would drag the
 * server's timezone into it and shift days across midnight.
 *
 * Plain module — used by both the server aggregation and the client UI.
 */

export type PeriodKind = "day" | "week" | "month" | "quarter" | "fy" | "all";

export interface Period {
  kind: PeriodKind;
  /** Inclusive yyyy-mm-dd. */
  start: string;
  /** Inclusive yyyy-mm-dd. */
  end: string;
  label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Days in a month, honouring leap years. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parse yyyy-mm-dd without timezone drift. */
export function parts(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

export function todayStr(now = new Date()): string {
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Shift a yyyy-mm-dd by whole days. */
export function addDays(dateStr: string, n: number): string {
  const { y, m, d } = parts(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * The AU financial year a date falls in, named the way the ATO does:
 * 1 Jul 2026 – 30 Jun 2027 is "FY 2026/27".
 */
export function financialYearOf(dateStr: string): { start: string; end: string; label: string } {
  const { y, m } = parts(dateStr);
  const startYear = m >= 7 ? y : y - 1;
  return {
    start: iso(startYear, 7, 1),
    end: iso(startYear + 1, 6, 30),
    label: `FY ${startYear}/${String(startYear + 1).slice(-2)}`,
  };
}

/** Build the period containing `anchor`, offset by `offset` whole periods. */
export function buildPeriod(kind: PeriodKind, anchor: string, offset = 0): Period {
  if (kind === "all") {
    return { kind, start: "1900-01-01", end: "2999-12-31", label: "All time" };
  }

  if (kind === "day") {
    const d = addDays(anchor, offset);
    const { y, m, d: dd } = parts(d);
    return { kind, start: d, end: d, label: `${dd} ${MONTHS[m - 1]} ${y}` };
  }

  if (kind === "week") {
    // Weeks start Monday — a tradie's week, and how timesheets already group.
    const { y, m, d } = parts(anchor);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const start = addDays(addDays(anchor, mondayOffset), offset * 7);
    const end = addDays(start, 6);
    const s = parts(start), e = parts(end);
    return {
      kind, start, end,
      label: `${s.d} ${MONTHS[s.m - 1]} – ${e.d} ${MONTHS[e.m - 1]} ${e.y}`,
    };
  }

  if (kind === "month") {
    const { y, m } = parts(anchor);
    const total = y * 12 + (m - 1) + offset;
    const yy = Math.floor(total / 12), mm = (total % 12) + 1;
    return {
      kind, start: iso(yy, mm, 1), end: iso(yy, mm, daysInMonth(yy, mm)),
      label: `${MONTHS[mm - 1]} ${yy}`,
    };
  }

  if (kind === "quarter") {
    // BAS quarters: Jul-Sep (Q1), Oct-Dec, Jan-Mar, Apr-Jun — financial-year
    // quarters, not calendar ones, because that's what BAS is filed on.
    const { y, m } = parts(anchor);
    const fyQuarterIndex = Math.floor(((m - 7 + 12) % 12) / 3);
    const fy = financialYearOf(anchor);
    const fyStartYear = parts(fy.start).y;
    const total = fyQuarterIndex + offset;
    const yearShift = Math.floor(total / 4);
    const q = ((total % 4) + 4) % 4;
    const startMonthAbs = 7 + q * 3 + (fyStartYear + yearShift) * 12;
    const sy = Math.floor((startMonthAbs - 1) / 12), sm = ((startMonthAbs - 1) % 12) + 1;
    const endAbs = startMonthAbs + 2;
    const ey = Math.floor((endAbs - 1) / 12), em = ((endAbs - 1) % 12) + 1;
    return {
      kind, start: iso(sy, sm, 1), end: iso(ey, em, daysInMonth(ey, em)),
      label: `Q${q + 1} ${MONTHS[sm - 1]}–${MONTHS[em - 1]} ${ey}`,
    };
  }

  // fy
  const base = financialYearOf(anchor);
  const startYear = parts(base.start).y + offset;
  return {
    kind: "fy",
    start: iso(startYear, 7, 1),
    end: iso(startYear + 1, 6, 30),
    label: `FY ${startYear}/${String(startYear + 1).slice(-2)}`,
  };
}

/** Every month between two dates, for a trend series. */
export function monthsBetween(start: string, end: string): { key: string; label: string; start: string; end: string }[] {
  const s = parts(start), e = parts(end);
  const out = [];
  let total = s.y * 12 + (s.m - 1);
  const last = e.y * 12 + (e.m - 1);
  // A long "all time" range would produce a useless chart; 24 months is plenty.
  while (total <= last && out.length < 24) {
    const y = Math.floor(total / 12), m = (total % 12) + 1;
    out.push({
      key: `${y}-${pad(m)}`, label: `${MONTHS[m - 1]} ${String(y).slice(-2)}`,
      start: iso(y, m, 1), end: iso(y, m, daysInMonth(y, m)),
    });
    total++;
  }
  return out;
}

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  day: "Day", week: "Week", month: "Month", quarter: "Quarter", fy: "Financial year", all: "All time",
};
