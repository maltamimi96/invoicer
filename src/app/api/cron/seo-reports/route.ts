/**
 * GET /api/cron/seo-reports — monthly.
 *
 * Auto-generates a DRAFT SEO report for every active site that has a linked
 * client, so the account manager just reviews + sends (approval gate; we never
 * auto-send). Skips sites that already got a report in the last 25 days.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assembleReport } from "@/lib/seo/report";
import { requireCron } from "@/lib/cron-auth";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sites } = await (sb as any)
    .from("seo_sites").select("id, business_id, domain, customer_id")
    .eq("status", "active").not("customer_id", "is", null).limit(500);

  const since = new Date(Date.now() - 25 * 86_400_000).toISOString();
  let generated = 0;
  for (const site of (sites ?? []) as Array<{ id: string; business_id: string; domain: string }>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recent } = await (sb as any).from("seo_reports").select("id").eq("site_id", site.id).gte("created_at", since).limit(1).maybeSingle();
    if (recent) continue;
    try {
      const fields = await assembleReport(sb, site.business_id, site.id, site.domain, 30);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from("seo_reports").insert({ business_id: site.business_id, site_id: site.id, status: "draft", ...fields });
      generated++;
    } catch { /* skip this site, keep going */ }
  }

  return NextResponse.json({ generated });
}
