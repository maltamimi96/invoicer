/**
 * Hunts that run themselves.
 *
 * Fires hourly. Each hunt names the weekdays it runs on and the local hour it
 * runs at, so "builders on Monday, strata on Tuesday" is three hunts with
 * three schedules — each with its own criteria, filters and campaign — rather
 * than one hunt rotating a query list and sending everybody the same pitch.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It never sends anything. A run fills the review queue; the outreach
 *     engine decides what leaves the building, inside the send window and
 *     under the daily cap it already enforces.
 *   - It never runs a hunt whose budget is spent. runHunt checks that itself,
 *     but the scheduler also skips inactive hunts and ones already running, so
 *     a slow run can't be started twice by two ticks of the cron.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runHunt, type HuntRow } from "@/lib/prospecting/run";

export const maxDuration = 300;

/** The weekday (0=Sun) and hour it is right now in a given timezone. */
function localNow(timezone: string): { day: number; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, weekday: "short", hour: "numeric", hour12: false,
    }).formatToParts(new Date());
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return { day: Math.max(0, days.indexOf(weekday)), hour: hour % 24 };
  } catch {
    // An unknown timezone must not wedge the whole cron for every business.
    const d = new Date();
    return { day: d.getUTCDay(), hour: d.getUTCHours() };
  }
}

/** Has this hunt already run today, in its own timezone? */
function ranToday(lastRunAt: string | null, timezone: string): boolean {
  if (!lastRunAt) return false;
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return fmt.format(new Date(lastRunAt)) === fmt.format(new Date());
  } catch {
    return new Date(lastRunAt).toISOString().slice(0, 10)
      === new Date().toISOString().slice(0, 10);
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  const { data: hunts, error } = await sb.from("prospect_hunts")
    .select("*").eq("active", true).not("run_days", "eq", "{}");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Record<string, unknown>[] = [];

  for (const hunt of (hunts ?? []) as HuntRow[] & Record<string, unknown>[]) {
    const h = hunt as unknown as HuntRow & {
      run_days: number[]; run_hour: number; timezone: string; last_run_at: string | null;
    };

    const { day, hour } = localNow(h.timezone || "Australia/Sydney");
    if (!h.run_days?.includes(day)) continue;
    if (hour !== h.run_hour) continue;
    // The cron fires hourly and a run can outlive its slot; without this a
    // retry an hour later would run the same hunt twice in a day.
    if (ranToday(h.last_run_at, h.timezone || "Australia/Sydney")) continue;

    // One run per hunt at a time — two concurrent runs would double-spend and
    // race each other on the same place_id upserts.
    const { data: active } = await sb.from("prospect_hunt_runs")
      .select("id").eq("hunt_id", h.id).eq("status", "running").limit(1).maybeSingle();
    if (active) {
      results.push({ hunt: h.name, skipped: "already running" });
      continue;
    }

    // Stamp BEFORE running, not after. A run takes minutes; stamping after
    // would let the next hourly tick start it again while it's still going.
    await sb.from("prospect_hunts")
      .update({ last_run_at: new Date().toISOString() }).eq("id", h.id);

    try {
      const result = await runHunt(sb, h);
      results.push({
        hunt: h.name, verified: result.verified, found: result.found,
        cost_cents: result.cost_cents, error: result.error,
      });
    } catch (e) {
      results.push({ hunt: h.name, error: e instanceof Error ? e.message : "failed" });
    }
  }

  return NextResponse.json({ checked: hunts?.length ?? 0, ran: results.length, results });
}
