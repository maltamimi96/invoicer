/**
 * GET /api/cron/invoice-reminders
 *
 * Runs daily at 9am UTC via Vercel Cron.
 * For every business with the "invoice-reminders" agent enabled:
 *  - Finds overdue invoices (sent/partial, past due date)
 *  - Skips invoices already reminded in the last 3 days
 *  - Emails the customer a polite payment reminder
 *  - Logs the send to agent_run_logs
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailBase, btn } from "@/lib/emails/base";
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
  const now = new Date().toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // Get all businesses with this agent enabled
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: installs } = await (sb as any)
    .from("business_agent_installs")
    .select("business_id, businesses(name, email, currency, accent_color)")
    .eq("agent_id", "invoice-reminders")
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

    // Get overdue invoices with customer email
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invoices } = await (sb as any)
      .from("invoices")
      .select("id, number, total, amount_paid, due_date, customers(name, email)")
      .eq("business_id", business_id)
      .in("status", ["sent", "partial"])
      .lt("due_date", now.split("T")[0])
      .not("customers", "is", null)
      .order("due_date", { ascending: true });

    if (!invoices?.length) continue;

    // Get already-reminded invoice IDs in the last 3 days
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentLogs } = await (sb as any)
      .from("agent_run_logs")
      .select("resource_id")
      .eq("business_id", business_id)
      .eq("agent_id", "invoice-reminders")
      .eq("resource_type", "invoice")
      .gte("ran_at", threeDaysAgo);

    const alreadyReminded = new Set((recentLogs ?? []).map((l: any) => l.resource_id));

    for (const invoice of invoices as any[]) {
      const customer = invoice.customers;
      if (!customer?.email || alreadyReminded.has(invoice.id)) {
        totalSkipped++;
        continue;
      }

      const outstanding = invoice.total - invoice.amount_paid;
      const daysOverdue = Math.floor(
        (Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      const accentColor = biz.accent_color ?? "#2563eb";

      const body = `
        <p style="font-size:15px;color:#374151;margin:0 0 16px;">Hi ${customer.name.split(" ")[0]},</p>
        <p style="font-size:15px;color:#374151;margin:0 0 16px;">
          This is a friendly reminder that invoice <strong>${invoice.number}</strong> from <strong>${biz.name}</strong>
          was due on <strong>${fmtDate(invoice.due_date)}</strong>
          (${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} ago) and remains unpaid.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #e5e7eb;">
          <tr>
            <td style="font-size:14px;color:#6b7280;">Invoice</td>
            <td style="font-size:14px;color:#111827;font-weight:600;text-align:right;">${invoice.number}</td>
          </tr>
          <tr>
            <td style="font-size:14px;color:#6b7280;padding-top:6px;">Due date</td>
            <td style="font-size:14px;color:#111827;font-weight:600;text-align:right;padding-top:6px;">${fmtDate(invoice.due_date)}</td>
          </tr>
          <tr>
            <td style="font-size:15px;color:#111827;font-weight:700;padding-top:10px;border-top:1px solid #e5e7eb;">Amount due</td>
            <td style="font-size:15px;color:#111827;font-weight:700;text-align:right;padding-top:10px;border-top:1px solid #e5e7eb;">${fmt(outstanding, biz.currency ?? "GBP")}</td>
          </tr>
        </table>
        <p style="font-size:14px;color:#6b7280;margin:16px 0;">
          If you have already made payment, please disregard this email. Otherwise, please arrange payment at your earliest convenience.
        </p>
        <p style="font-size:14px;color:#6b7280;margin:16px 0;">
          If you have any questions about this invoice, please reply to this email or contact us directly.
        </p>
      `;

      try {
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: `Payment reminder: ${invoice.number} — ${fmt(outstanding, biz.currency ?? "GBP")} overdue`,
          html: emailBase(`Payment Reminder — ${invoice.number}`, body, accentColor),
        });

        // Log the send
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from("agent_run_logs").insert({
          business_id,
          agent_id: "invoice-reminders",
          resource_type: "invoice",
          resource_id: invoice.id,
        });

        totalSent++;
      } catch (e) {
        console.error(`Invoice reminder failed for ${customer.email}:`, e);
      }
    }
  }

  return NextResponse.json({ ok: true, sent: totalSent, skipped: totalSkipped });
}
