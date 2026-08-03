/**
 * GET /api/cron/outreach
 *
 * The heartbeat of the outreach agent — the replacement for the standalone
 * agent's daily GitHub Action.
 *
 * Runs hourly rather than daily: each business declares its own send window and
 * send days, so the engine only actually sends when the local clock is inside
 * that window. Every business with the plugin enabled is processed in turn:
 *   1. auto-enrol prospects matching each running campaign's filter
 *   2. send every enrollment that's due, within the daily cap
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCron } from "@/lib/cron-auth";
import { autoEnroll, runOutreachForBusiness } from "@/lib/outreach/engine";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const sb = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (sb as any)
    .from("outreach_settings").select("business_id").eq("enabled", true);

  const results: { business_id: string; enrolled: number; sent: number; failed: number }[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of ((settings ?? []) as any[])) {
    const businessId = s.business_id;
    let enrolled = 0;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campaigns } = await (sb as any)
        .from("outreach_campaigns").select("id")
        .eq("business_id", businessId).eq("status", "running").eq("auto_enroll", true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of ((campaigns ?? []) as any[])) {
        try { enrolled += await autoEnroll(sb, businessId, c.id); }
        catch { /* one bad campaign shouldn't stop the rest */ }
      }

      const run = await runOutreachForBusiness(sb, businessId);
      results.push({ business_id: businessId, enrolled, sent: run.sent, failed: run.failed });
    } catch (e) {
      results.push({ business_id: businessId, enrolled, sent: 0, failed: 0 });
      console.error("outreach cron failed for", businessId, e);
    }
  }

  return NextResponse.json({
    ok: true,
    businesses: results.length,
    sent: results.reduce((n, r) => n + r.sent, 0),
    enrolled: results.reduce((n, r) => n + r.enrolled, 0),
    results,
  });
}
