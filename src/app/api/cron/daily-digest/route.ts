/**
 * GET /api/cron/daily-digest
 *
 * Runs daily at 7am UTC via Vercel Cron.
 * For every business with the "daily-digest" agent enabled:
 *  - Aggregates: today's revenue, new leads, overdue invoices, pending quotes, today's work orders
 *  - Emails the business owner a morning summary
 *  - Skips if already sent today
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

function todayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

function statRow(label: string, value: string, highlight = false): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:${highlight ? "16" : "14"}px;font-weight:${highlight ? "700" : "600"};color:#111827;text-align:right;">${value}</td>
    </tr>
  `;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const sb = createAdminClient();
  const today = todayUTC();
  const startOfMonth = today.substring(0, 7) + "-01";
  const startOfDay = today + "T00:00:00.000Z";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: installs } = await (sb as any)
    .from("business_agent_installs")
    .select("business_id, businesses(name, email, currency, accent_color)")
    .eq("agent_id", "daily-digest")
    .eq("enabled", true);

  if (!installs?.length) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const resend = getResend();
  let totalSent = 0;

  for (const install of installs) {
    const { business_id, businesses: biz } = install as any;
    if (!biz?.email) continue; // need somewhere to send the digest

    // Skip if already sent today
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sentToday } = await (sb as any)
      .from("agent_run_logs")
      .select("id")
      .eq("business_id", business_id)
      .eq("agent_id", "daily-digest")
      .gte("ran_at", startOfDay)
      .limit(1);

    if (sentToday?.length) continue;

    // Gather stats in parallel
    const [invoicesRes, quotesRes, leadsRes, workOrdersRes, paidTodayRes, revenueMonthRes] =
      await Promise.all([
        // Overdue invoices
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any)
          .from("invoices")
          .select("id, total, amount_paid")
          .eq("business_id", business_id)
          .in("status", ["sent", "partial"])
          .lt("due_date", today),

        // Pending quotes (sent, not expired)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any)
          .from("quotes")
          .select("id, total")
          .eq("business_id", business_id)
          .eq("status", "sent")
          .gte("expiry_date", today),

        // New leads today
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any)
          .from("leads")
          .select("id")
          .eq("business_id", business_id)
          .gte("created_at", startOfDay),

        // Work orders today
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any)
          .from("work_orders")
          .select("id, title, status, start_time")
          .eq("business_id", business_id)
          .eq("scheduled_date", today)
          .not("status", "eq", "cancelled")
          .order("start_time", { ascending: true, nullsFirst: false }),

        // Payments recorded today
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any)
          .from("payments")
          .select("amount")
          .eq("business_id", business_id)
          .gte("payment_date", today),

        // Revenue this month (paid invoices)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any)
          .from("invoices")
          .select("total, amount_paid")
          .eq("business_id", business_id)
          .eq("status", "paid")
          .gte("updated_at", startOfMonth),
      ]);

    const currency = biz.currency ?? "GBP";
    const accentColor = biz.accent_color ?? "#2563eb";

    const overdueInvoices = invoicesRes.data ?? [];
    const pendingQuotes = quotesRes.data ?? [];
    const newLeads = leadsRes.data ?? [];
    const todayJobs = workOrdersRes.data ?? [];
    const paymentsToday = paidTodayRes.data ?? [];
    const paidInvoicesMonth = revenueMonthRes.data ?? [];

    const overdueAmount = overdueInvoices.reduce(
      (sum: number, i: any) => sum + (i.total - i.amount_paid), 0
    );
    const pendingQuoteValue = pendingQuotes.reduce((sum: number, q: any) => sum + q.total, 0);
    const paidToday = paymentsToday.reduce((sum: number, p: any) => sum + p.amount, 0);
    const revenueMonth = paidInvoicesMonth.reduce((sum: number, i: any) => sum + i.amount_paid, 0);

    // Build jobs section
    const jobsSection = todayJobs.length
      ? `
        <p style="font-size:14px;font-weight:600;color:#374151;margin:20px 0 8px;">Today's Jobs (${todayJobs.length})</p>
        ${(todayJobs as any[]).map((j) => `
          <div style="padding:8px 12px;background:#f9fafb;border-radius:6px;margin-bottom:6px;border-left:3px solid ${accentColor};">
            <span style="font-size:13px;font-weight:600;color:#111827;">${j.title}</span>
            ${j.start_time ? `<span style="font-size:12px;color:#6b7280;margin-left:8px;">${j.start_time.substring(0, 5)}</span>` : ""}
          </div>
        `).join("")}
      `
      : `<p style="font-size:14px;color:#9ca3af;margin:16px 0;">No jobs scheduled today.</p>`;

    const body = `
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Good morning! Here's your business overview for today.</p>

      <table width="100%" cellpadding="0" cellspacing="0">
        ${statRow("Paid today", fmt(paidToday, currency), true)}
        ${statRow("Revenue this month", fmt(revenueMonth, currency))}
        ${statRow("Overdue invoices", `${overdueInvoices.length} · ${fmt(overdueAmount, currency)}`)}
        ${statRow("Pending quotes", `${pendingQuotes.length} · ${fmt(pendingQuoteValue, currency)}`)}
        ${statRow("New leads today", String(newLeads.length))}
      </table>

      ${jobsSection}
    `;

    try {
      await resend.emails.send({
        from: FROM,
        to: biz.email,
        subject: `${biz.name} — Daily digest for ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`,
        html: emailBase(`Good morning, ${biz.name}`, body, accentColor),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from("agent_run_logs").insert({
        business_id,
        agent_id: "daily-digest",
      });

      totalSent++;
    } catch (e) {
      console.error(`Daily digest failed for ${biz.email}:`, e);
    }
  }

  return NextResponse.json({ ok: true, sent: totalSent });
}
