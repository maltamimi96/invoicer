/**
 * MCP tools for the Timesheets & payroll plugin. Scopes: timesheets:read /
 * timesheets:write.
 */
import { z } from "zod";
import { assertScope, t, text } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";

function mondayOf(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().split("T")[0];
}

export function registerTimesheetTools(tool: ToolFn): void {
  tool("get_timesheet", "Weekly hours per worker (work + travel, break excluded) with pay. week = any date in the week (defaults to this week).",
    { week: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "timesheets:read");
      const weekStart = mondayOf(args.week && /^\d{4}-\d{2}-\d{2}$/.test(args.week) ? args.week : new Date().toISOString().split("T")[0]);
      const start = new Date(weekStart + "T00:00:00Z");
      const end = new Date(start.getTime() + 7 * 86400000);

      const [entriesRes, membersRes] = await Promise.all([
        t(ctx, "job_time_entries").select("user_id, duration_seconds, type").eq("business_id", ctx.businessId)
          .gte("started_at", start.toISOString()).lt("started_at", end.toISOString()),
        t(ctx, "member_profiles").select("user_id, name, email, hourly_rate").eq("business_id", ctx.businessId),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const members = new Map<string, any>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const m of (membersRes.data ?? []) as any[]) if (m.user_id) members.set(m.user_id, m);
      const byUser = new Map<string, { name: string; hours: number; rate: number | null }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const e of (entriesRes.data ?? []) as any[]) {
        if (e.type === "break") continue;
        const k = e.user_id ?? "unknown";
        const m = members.get(k);
        if (!byUser.has(k)) byUser.set(k, { name: m?.name || m?.email || "Team member", hours: 0, rate: m?.hourly_rate != null ? Number(m.hourly_rate) : null });
        byUser.get(k)!.hours += Number(e.duration_seconds || 0) / 3600;
      }
      const rows = [...byUser.values()].map((r) => ({ name: r.name, hours: Math.round(r.hours * 100) / 100, hourly_rate: r.rate, pay: r.rate != null ? Math.round(r.hours * r.rate * 100) / 100 : 0 }));
      return text({ week_start: weekStart, rows, total_hours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100, total_pay: Math.round(rows.reduce((s, r) => s + r.pay, 0) * 100) / 100 });
    });

  tool("set_member_rate", "Set a team member's hourly pay rate (member_id from list_team).",
    { member_id: UUID, hourly_rate: z.number().nullable() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "timesheets:write");
      const { error } = await t(ctx, "member_profiles").update({ hourly_rate: args.hourly_rate }).eq("id", args.member_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });
}
