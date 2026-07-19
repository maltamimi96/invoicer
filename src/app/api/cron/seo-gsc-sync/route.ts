/**
 * GET /api/cron/seo-gsc-sync — daily.
 *
 * Pulls Search Console query performance into seo_keyword_snapshots for every
 * active site with a connected GSC connection. That table already feeds the
 * client report PDFs (src/lib/seo/report.ts) — this is the producer that was
 * missing.
 *
 * Costs nothing (no Claude call), so it deliberately does NOT go through the
 * seoSpendStatus budget gate.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { accessTokenFor, querySearchAnalytics } from "@/lib/seo/gsc";
import { requireCron } from "@/lib/cron-auth";

export const maxDuration = 300;

const isoDate = (d: Date) => d.toISOString().split("T")[0];

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conns } = await (sb as any)
    .from("seo_connections")
    .select("id, business_id, site_id, meta, secret, seo_sites!inner(status)")
    .eq("provider", "gsc").eq("status", "connected")
    .eq("seo_sites.status", "active")
    .limit(500);

  // GSC lags ~2-3 days and RESTATES recent days — always re-pull a trailing
  // window rather than just yesterday, and let the unique key upsert over it.
  const end = new Date();
  const start = new Date(Date.now() - 5 * 86_400_000);

  let synced = 0, rows = 0;
  const errors: string[] = [];

  for (const c of (conns ?? []) as Array<{ id: string; business_id: string; site_id: string; meta: Record<string, string>; secret: string | null }>) {
    try {
      if (!c.secret) continue;
      const siteUrl = c.meta?.site_url;
      if (!siteUrl) continue;

      const { refresh_token } = JSON.parse(decryptSecret(c.secret)) as { refresh_token?: string };
      if (!refresh_token) continue;

      const token = await accessTokenFor(refresh_token);
      const result = await querySearchAnalytics(token, siteUrl, {
        startDate: isoDate(start), endDate: isoDate(end),
        dimensions: ["date", "query"], rowLimit: 500,
      });

      const payload = result
        .filter((r) => r.keys?.length >= 2)
        .map((r) => ({
          business_id: c.business_id, site_id: c.site_id,
          captured_at: r.keys[0], keyword: r.keys[1],
          position: r.position ?? null,
          clicks: Math.round(r.clicks ?? 0),
          impressions: Math.round(r.impressions ?? 0),
          ctr: r.ctr ?? null,
        }));

      if (payload.length > 0) {
        // Upserts on the (site_id, keyword, captured_at) unique index, so a
        // re-run over restated days corrects rather than duplicates.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (sb as any).from("seo_keyword_snapshots")
          .upsert(payload, { onConflict: "site_id,keyword,captured_at" });
        if (error) throw error;
        rows += payload.length;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from("seo_connections")
        .update({ status: "connected", account_ref: siteUrl }).eq("id", c.id);
      synced++;
    } catch (e) {
      // One bad connection (revoked token, 7-day Testing expiry) must not kill
      // the run — flag it so the UI shows "error" and the user reconnects.
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${c.site_id}: ${msg.slice(0, 120)}`);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from("seo_connections").update({ status: "error" }).eq("id", c.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from("seo_job_events").insert({
          business_id: c.business_id, site_id: c.site_id, level: "error",
          message: `Search Console sync failed — ${msg.slice(0, 200)}`,
        });
      } catch { /* best effort */ }
    }
  }

  return NextResponse.json({ synced, rows, errors: errors.length ? errors : undefined });
}
