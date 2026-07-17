/**
 * Campaign cadence + date maths.
 *
 * Plain module, deliberately: a "use server" file may only export async
 * functions, and a sync export there breaks every export in it at build (it
 * already cost this repo a production build — see CLAUDE.md). The actions, the
 * MCP tools and the UI all read these.
 */

export const CADENCES = [
  { id: "daily", label: "Daily", days: 1 },
  { id: "every_2_days", label: "Every 2 days", days: 2 },
  { id: "twice_weekly", label: "Twice a week", days: 3 },
  { id: "weekly", label: "Weekly", days: 7 },
  { id: "fortnightly", label: "Fortnightly", days: 14 },
] as const;

export type CadenceId = (typeof CADENCES)[number]["id"];

const BY_ID = new Map<string, number>(CADENCES.map((c) => [c.id, c.days]));

/** Unknown/absent cadence falls back to weekly rather than throwing — a
 *  campaign with a typo'd cadence should still plan, just conservatively. */
export function cadenceDays(cadence: string | null | undefined): number {
  return BY_ID.get(String(cadence)) ?? 7;
}

export function isCadence(v: unknown): v is CadenceId {
  return typeof v === "string" && BY_ID.has(v);
}

/** YYYY-MM-DD, UTC. The column is a DATE — no time, no zone. */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The dates a campaign's pieces should go out on.
 *
 * Parsed as UTC midday, not midnight: `new Date("2026-07-17")` is UTC midnight,
 * and adding days to it then formatting in a negative-offset zone can slip a
 * day. Midday leaves 12 hours of headroom either way.
 */
export function planDates(startsOn: string, cadence: string | null, count: number): string[] {
  const base = new Date(`${startsOn}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) throw new Error("The campaign needs a valid start date.");

  const step = cadenceDays(cadence);
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i * step);
    return iso(d);
  });
}
