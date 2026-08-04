/**
 * GET /api/cron/telephony-sync — daily reconcile against the VoIPcloud API.
 *
 * The webhook is the live path; this is the safety net. It re-pulls the last
 * few days so anything the webhook missed (a deploy, an outage, a mistyped
 * secret) still lands. Ingest is keyed on unique_call_id, so re-pulling a call
 * we already have updates it rather than duplicating it.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCron } from "@/lib/cron-auth";
import { syncCallsForBusiness, ymd } from "@/lib/telephony/sync";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (sb as any)
    .from("telephony_settings").select("business_id")
    .eq("enabled", true).eq("sync_enabled", true).not("api_key_enc", "is", null);

  const results = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of ((rows ?? []) as any[])) {
    try {
      const res = await syncCallsForBusiness(sb, r.business_id, {
        fromDate: ymd(new Date(Date.now() - 3 * 86400_000)),
        includeGroups: true,
      });
      results.push({ business_id: r.business_id, ...res });
    } catch (e) {
      console.error("telephony sync failed for", r.business_id, e);
      results.push({ business_id: r.business_id, fetched: 0, ingested: 0, skipped: 0, errors: ["failed"] });
    }
  }

  return NextResponse.json({
    ok: true,
    businesses: results.length,
    ingested: results.reduce((n, r) => n + r.ingested, 0),
    results,
  });
}
