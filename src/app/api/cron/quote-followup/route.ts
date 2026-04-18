/**
 * GET /api/cron/quote-followup
 *
 * Runs daily at 10am UTC via Vercel Cron.
 * For every business with the "quote-followup" agent enabled:
 *  - Finds sent quotes expiring within 3 days or up to 2 days past expiry
 *  - Skips quotes already followed up in the last 5 days
 *  - Emails the customer a follow-up nudge
 *  - Logs the send to agent_run_logs
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailBase } from "@/lib/emails/base";
import { Resend } from "resend";

export const maxDuration = 60;

const FROM = process.env.RESEND_FROM_EMAIL ?? "Invoicer <noreply@resend.dev>";

function getResend() { return new Resend(process.env.RESEND_API_KEY!); }

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const sb = createAdminClient();
  const today = new Date();
  const in3Days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: installs } = await (sb as any)
    .from("business_agent_installs")
    .select("business_id, businesses(name, email, currency, accent_color)")
    .eq("agent_id", "quote-followup")
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

    // Sent quotes expiring soon (within 3 days) or just expired (within 2 days)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quotes } = await (sb as any)
      .from("quotes")
      .select("id, number, total, expiry_date, customers(name, email)")
      .eq("business_id", business_id)
      .eq("status", "sent")
      .gte("expiry_date", twoDaysAgo)
      .lte("expiry_date", in3Days)
      .not("customers", "is", null)
      .order("expiry_date", { ascending: true });

    if (!quotes?.length) continue;

    // Get already followed-up quote IDs in the last 5 days
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentLogs } = await (sb as any)
      .from("agent_run_logs")
      .select("resource_id")
      .eq("business_id", business_id)
      .eq("agent_id", "quote-followup")
      .eq("resource_type", "quote")
      .gte("ran_at", fiveDaysAgo);

    const alreadyFollowedUp = new Set((recentLogs ?? []).map((l: any) => l.resource_id));

    for (const quote of quotes as any[]) {
      const customer = quote.customers;
      if (!customer?.email || alreadyFollowedUp.has(quote.id)) {
        totalSkipped++;
        continue;
      }

      const expiryDate = new Date(quote.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const isExpired = daysUntilExpiry < 0;
      const accentColor = biz.accent_color ?? "#2563eb";

      const urgencyText = isExpired
        ? `Your quote expired on <strong>${fmtDate(quote.expiry_date)}</strong>. We can still honour it — just get in touch.`
        : daysUntilExpiry === 0
        ? `Your quote <strong>expires today</strong>. Don't miss out!`
        : `Your quote expires in <strong>${daysUntilExpiry} day${daysUntilExpiry !== 1 ? "s" : ""}</strong> on ${fmtDate(quote.expiry_date)}.`;

      const body = `
        <p style="font-size:15px;color:#374151;margin:0 0 16px;">Hi ${customer.name.split(" ")[0]},</p>
        <p style="font-size:15px;color:#374151;margin:0 0 16px;">
          We wanted to follow up on quote <strong>${quote.number}</strong> from <strong>${biz.name}</strong>.
          ${urgencyText}
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #e5e7eb;">
          <tr>
            <td style="font-size:14px;color:#6b7280;">Quote</td>
            <td style="font-size:14px;color:#111827;font-weight:600;text-align:right;">${quote.number}</td>
          </tr>
          <tr>
            <td style="font-size:14px;color:#6b7280;padding-top:6px;">Expiry date</td>
            <td style="font-size:14px;color:#111827;font-weight:600;text-align:right;padding-top:6px;">${fmtDate(quote.expiry_date)}</td>
          </tr>
          <tr>
            <td style="font-size:15px;color:#111827;font-weight:700;padding-top:10px;border-top:1px solid #e5e7eb;">Quote total</td>
            <td style="font-size:15px;color:#111827;font-weight:700;text-align:right;padding-top:10px;border-top:1px solid #e5e7eb;">${fmt(quote.total, biz.currency ?? "GBP")}</td>
          </tr>
        </table>
        <p style="font-size:14px;color:#6b7280;margin:16px 0;">
          Have any questions or want to move ahead? Simply reply to this email and we'll get back to you promptly.
        </p>
      `;

      try {
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: `Following up on your quote ${quote.number} from ${biz.name}`,
          html: emailBase(`Quote Follow-up — ${quote.number}`, body, accentColor),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from("agent_run_logs").insert({
          business_id,
          agent_id: "quote-followup",
          resource_type: "quote",
          resource_id: quote.id,
        });

        totalSent++;
      } catch (e) {
        console.error(`Quote follow-up failed for ${customer.email}:`, e);
      }
    }
  }

  return NextResponse.json({ ok: true, sent: totalSent, skipped: totalSkipped });
}
