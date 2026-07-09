"use server";

/**
 * Timesheets & payroll (field-services plugin). Rolls up job_time_entries per
 * worker for a week (work + travel = paid; break excluded), joins the member's
 * hourly_rate for pay. Scopes: timesheets:read / timesheets:write.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, businessId };
}

/** Monday 00:00 of the week containing `d` (ISO date). */
export async function weekStartOf(dateISO: string): Promise<string> {
  const d = new Date(dateISO + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().split("T")[0];
}

interface TimesheetRow {
  user_id: string; member_id: string | null; name: string; hourly_rate: number | null;
  days: number[]; hours: number; pay: number;
}

export async function getTimesheet(weekStartISO: string): Promise<{
  week_start: string; week_end: string; rows: TimesheetRow[]; total_hours: number; total_pay: number;
}> {
  const { supabase, businessId } = await ctx();
  const start = new Date(weekStartISO + "T00:00:00Z");
  const end = new Date(start.getTime() + 7 * 86400000);

  const [entriesRes, membersRes] = await Promise.all([
    tbl(supabase, "job_time_entries").select("user_id, started_at, duration_seconds, type")
      .eq("business_id", businessId).gte("started_at", start.toISOString()).lt("started_at", end.toISOString()),
    tbl(supabase, "member_profiles").select("id, user_id, name, email, hourly_rate").eq("business_id", businessId),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (membersRes.data ?? []) as any[]) if (m.user_id) members.set(m.user_id, m);

  const byUser = new Map<string, TimesheetRow>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (entriesRes.data ?? []) as any[]) {
    if (e.type === "break") continue;
    const uidKey = e.user_id ?? "unknown";
    if (!byUser.has(uidKey)) {
      const m = members.get(uidKey);
      byUser.set(uidKey, {
        user_id: uidKey, member_id: m?.id ?? null,
        name: m?.name || m?.email || "Team member", hourly_rate: m?.hourly_rate != null ? num(m.hourly_rate) : null,
        days: [0, 0, 0, 0, 0, 0, 0], hours: 0, pay: 0,
      });
    }
    const row = byUser.get(uidKey)!;
    const hrs = num(e.duration_seconds) / 3600;
    const dayIdx = (new Date(e.started_at).getUTCDay() + 6) % 7;
    row.days[dayIdx] += hrs;
    row.hours += hrs;
  }

  const rows = [...byUser.values()].map((r) => ({
    ...r,
    hours: Math.round(r.hours * 100) / 100,
    days: r.days.map((h) => Math.round(h * 100) / 100),
    pay: r.hourly_rate != null ? Math.round(r.hours * r.hourly_rate * 100) / 100 : 0,
  })).sort((a, b) => b.hours - a.hours);

  return {
    week_start: weekStartISO,
    week_end: new Date(end.getTime() - 86400000).toISOString().split("T")[0],
    rows,
    total_hours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
    total_pay: Math.round(rows.reduce((s, r) => s + r.pay, 0) * 100) / 100,
  };
}

export async function setMemberRate(memberId: string, hourlyRate: number | null): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "member_profiles")
    .update({ hourly_rate: hourlyRate == null || Number.isNaN(Number(hourlyRate)) ? null : Number(hourlyRate) })
    .eq("id", memberId).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/timesheets");
}
