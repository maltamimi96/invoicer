/**
 * GET /api/cron/workorder-complete
 *
 * Runs every 4 hours via Vercel Cron.
 * For every business with the "workorder-complete-notifier" agent enabled:
 *  - Finds work orders recently set to "completed"
 *  - Skips work orders already notified
 *  - Emails the customer a job completion summary
 *  - Logs the send to agent_run_logs
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailBase } from "@/lib/emails/base";
import { Resend } from "resend";

export const maxDuration = 60;

const FROM = process.env.RESEND_FROM_EMAIL ?? "Invoicer <noreply@resend.dev>";

function getResend() { return new Resend(process.env.RESEND_API_KEY!); }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const sb = createAdminClient();
  // Look back 5 hours (slightly more than the 4-hour cron interval)
  const lookback = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: installs } = await (sb as any)
    .from("business_agent_installs")
    .select("business_id, businesses(name, email, currency, accent_color)")
    .eq("agent_id", "workorder-complete-notifier")
    .eq("enabled", true);

  if (!installs?.length) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const resend = getResend();
  let totalSent = 0;
  let totalSkipped = 0;

  for (const install of installs) {
    const { business_id, businesses: biz } = install as any;
    if (!biz) continue;

    // Work orders completed recently
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: workOrders } = await (sb as any)
      .from("work_orders")
      .select("id, number, title, property_address, scheduled_date, updated_at, customers(name, email)")
      .eq("business_id", business_id)
      .eq("status", "completed")
      .gte("updated_at", lookback)
      .not("customers", "is", null)
      .order("updated_at", { ascending: false });

    if (!workOrders?.length) continue;

    // Get already-notified work order IDs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sentLogs } = await (sb as any)
      .from("agent_run_logs")
      .select("resource_id")
      .eq("business_id", business_id)
      .eq("agent_id", "workorder-complete-notifier")
      .eq("resource_type", "work_order")
      .in("resource_id", (workOrders as any[]).map((w) => w.id));

    const alreadyNotified = new Set((sentLogs ?? []).map((l: any) => l.resource_id));

    for (const wo of workOrders as any[]) {
      const customer = wo.customers;
      if (!customer?.email || alreadyNotified.has(wo.id)) {
        totalSkipped++;
        continue;
      }

      const accentColor = biz.accent_color ?? "#10b981";

      const body = `
        <p style="font-size:15px;color:#374151;margin:0 0 16px;">Hi ${customer.name.split(" ")[0]},</p>
        <p style="font-size:15px;color:#374151;margin:0 0 16px;">
          Great news! Our team has completed the work at your property. Here's a summary:
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #bbf7d0;">
          <tr>
            <td style="font-size:14px;color:#6b7280;">Job</td>
            <td style="font-size:14px;color:#111827;font-weight:600;text-align:right;">${wo.title}</td>
          </tr>
          ${wo.number ? `
          <tr>
            <td style="font-size:14px;color:#6b7280;padding-top:6px;">Work order</td>
            <td style="font-size:14px;color:#111827;font-weight:600;text-align:right;padding-top:6px;">#${wo.number}</td>
          </tr>` : ""}
          ${wo.property_address ? `
          <tr>
            <td style="font-size:14px;color:#6b7280;padding-top:6px;">Location</td>
            <td style="font-size:14px;color:#111827;font-weight:600;text-align:right;padding-top:6px;">${wo.property_address}</td>
          </tr>` : ""}
          ${wo.scheduled_date ? `
          <tr>
            <td style="font-size:14px;color:#6b7280;padding-top:6px;">Date</td>
            <td style="font-size:14px;color:#111827;font-weight:600;text-align:right;padding-top:6px;">${fmtDate(wo.scheduled_date)}</td>
          </tr>` : ""}
          <tr>
            <td colspan="2" style="padding-top:10px;border-top:1px solid #bbf7d0;">
              <span style="display:inline-block;padding:4px 10px;background:#10b981;color:white;border-radius:20px;font-size:12px;font-weight:600;">✓ Completed</span>
            </td>
          </tr>
        </table>
        <p style="font-size:14px;color:#6b7280;margin:16px 0;">
          Thank you for choosing <strong>${biz.name}</strong>. If you have any feedback or questions about the completed work, please don't hesitate to get in touch.
        </p>
      `;

      try {
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: `Job completed — ${wo.title}`,
          html: emailBase(`Work Complete — ${wo.title}`, body, accentColor),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from("agent_run_logs").insert({
          business_id,
          agent_id: "workorder-complete-notifier",
          resource_type: "work_order",
          resource_id: wo.id,
        });

        totalSent++;
      } catch (e) {
        console.error(`Work order completion email failed for ${customer.email}:`, e);
      }
    }
  }

  return NextResponse.json({ ok: true, sent: totalSent, skipped: totalSkipped });
}
