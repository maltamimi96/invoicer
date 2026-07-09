/**
 * GET /api/cron/seo-audits — runs queued instant audits (Phase 4).
 * For each queued audit: run the auditor agent, then email the prospect a
 * branded link to their result page. A few per tick so no run is long.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSiteAudit } from "@/lib/seo/engine";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { appUrl } from "@/lib/app-url";

export const maxDuration = 300;
const MAX_PER_TICK = 3;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: queued } = await (sb as any)
    .from("seo_audits").select("id, business_id, url, email, name, view_token")
    .eq("status", "queued").order("created_at", { ascending: true }).limit(MAX_PER_TICK);

  let done = 0;
  for (const audit of (queued ?? []) as Array<{ id: string; business_id: string; url: string; email: string | null; name: string | null; view_token: string | null }>) {
    try {
      await runSiteAudit(sb, audit.id);
      if (audit.email) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: business } = await (sb as any).from("businesses").select("name, email").eq("id", audit.business_id).maybeSingle();
        const link = `${appUrl()}/audit/report/${audit.id}?token=${audit.view_token}`;
        const html = `<div style="font-family:system-ui,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
          <h2 style="margin:0 0 8px">Your SEO audit is ready</h2>
          <p>Hi ${audit.name ?? "there"}, we ran a free SEO audit on <strong>${audit.url}</strong>. Here's your report:</p>
          <p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#047857;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">View your audit</a></p>
          <p style="color:#64748b;font-size:12px;word-break:break-all">${link}</p>
        </div>`;
        await sendEmail({
          to: audit.email, subject: `Your SEO audit — ${audit.url}`, html,
          from: buildBusinessFrom({ name: business?.name ?? "Kirei", localPart: "audit" }),
          replyTo: business?.email ?? undefined,
          tags: { business_id: audit.business_id, doc_type: "custom", doc_id: audit.id },
        });
      }
      done++;
    } catch { /* keep going */ }
  }

  return NextResponse.json({ processed: done });
}
