/**
 * GET /api/cron/reminders
 *
 * Runs daily at 8pm UTC (6am AEST) via Vercel Cron.
 * 1. Telegram to the operator: today's schedule (one business — see below)
 * 2. Email to each assigned worker: their jobs for today
 * 3. Customer reminder emails for tomorrow's jobs
 *
 * This used to run for ONE hardcoded business id, with Crown Roofers' name,
 * phone, ABN and reply-to baked into the customer email. So every other
 * business on Kirei got no reminders at all — and had it merely been looped,
 * their customers would have received another company's branding.
 *
 * It now runs for every business with jobs on the day, and each one's emails
 * carry its own name, sender address and reply-to.
 *
 * Telegram is the exception and stays single-business on purpose:
 * TELEGRAM_CHAT_ID is one person's chat, and broadcasting every tenant's
 * schedule into it would leak other businesses' work to whoever owns it.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { requireCron } from "@/lib/cron-auth";
import { buildBusinessFrom } from "@/lib/email";

/** Whose schedule goes to the Telegram chat. Not a tenant filter any more. */
const TELEGRAM_BUSINESS_ID = process.env.AGENT_BUSINESS_ID ?? "ff3a47f3-54b0-45e3-b7a9-69ddc9fa787e";
const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID     = process.env.TELEGRAM_CHAT_ID!;

/** One business's details, for addressing its own emails. */
interface BizContact {
  id: string; name: string;
  email: string | null; phone: string | null; website: string | null;
}

/** "Name <someone@theirslug.kireihq.com>" — the same per-business sender every
 *  other outbound path uses, instead of one hardcoded address. */
function fromFor(biz: BizContact): string {
  // No slug is passed: `businesses` has no slug column, and buildBusinessFrom
  // slugifies the name when one isn't given. Selecting a column that doesn't
  // exist would have failed the whole query and killed reminders for everyone.
  return buildBusinessFrom({ name: biz.name, localPart: "reminders" });
}

function getResend() { return new Resend(process.env.RESEND_API_KEY!); }

function todayAEST(): string {
  // UTC+10 (AEST), no DST adjustment — close enough for a daily cron
  const now = new Date();
  now.setHours(now.getHours() + 10);
  return now.toISOString().split("T")[0];
}

function tomorrowAEST(): string {
  const now = new Date();
  now.setHours(now.getHours() + 10);
  now.setDate(now.getDate() + 1);
  return now.toISOString().split("T")[0];
}

function fmt12(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;
}

function fmtDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
}

async function sendTelegram(text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch { /* non-fatal */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getJobsForDate(sb: any, businessId: string, date: string) {
  const { data } = await sb
    .from("work_orders")
    .select(`
      id, title, number, status, property_address, start_time, end_time,
      customers(name, email, phone),
      work_order_assignments(
        id, member_profile_id, reminder_sent_at,
        member_profiles(id, name, email, phone)
      )
    `)
    .eq("business_id", businessId)
    .eq("scheduled_date", date)
    .not("status", "eq", "cancelled")
    .order("start_time", { ascending: true, nullsFirst: false });
  return (data ?? []) as any[];
}


export async function GET(req: NextRequest) {
  // Auth: Vercel sets CRON_SECRET, or allow explicit bearer
  const denied = requireCron(req);
  if (denied) return denied;

  const sb = createAdminClient();
  const today = todayAEST();
  const tomorrow = tomorrowAEST();

  // Which businesses actually have work on either day. One cheap query rather
  // than walking every business on the platform every morning.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scheduled } = await (sb as any)
    .from("work_orders")
    .select("business_id")
    .in("scheduled_date", [today, tomorrow])
    .not("status", "eq", "cancelled")
    .limit(5000);

  const businessIds = [
    ...new Set(((scheduled ?? []) as Array<{ business_id: string }>).map((r) => r.business_id)),
  ];

  if (businessIds.length === 0) {
    // Still tell the operator their own day is clear, as it always did.
    await sendTelegram(`📅 <b>Schedule for ${fmtDate(today)}</b>\n\nNo jobs scheduled today. 🏖️`);
    return NextResponse.json({
      ok: true, businesses: 0,
      today: { date: today, workers_emailed: 0 },
      tomorrow: { date: tomorrow, customer_reminders: 0 },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bizRows } = await (sb as any)
    .from("businesses")
    .select("id, name, email, phone, website")
    .in("id", businessIds);
  const businesses = (bizRows ?? []) as BizContact[];

  const resend = getResend();
  let workersEmailed = 0;
  let customerReminders = 0;

  for (const biz of businesses) {
    const [todayJobs, tomorrowJobs] = await Promise.all([
      getJobsForDate(sb, biz.id, today),
      getJobsForDate(sb, biz.id, tomorrow),
    ]);

    // ── 1. Telegram — only the configured business (see the file header) ────
    if (biz.id === TELEGRAM_BUSINESS_ID) {
      if (todayJobs.length === 0) {
        await sendTelegram(`📅 <b>Schedule for ${fmtDate(today)}</b>\n\nNo jobs scheduled today. 🏖️`);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines = todayJobs.map((j: any) => {
          const time = j.start_time ? ` · ${fmt12(j.start_time)}${j.end_time ? `–${fmt12(j.end_time)}` : ""}` : "";
          const addr = j.property_address ? `\n   📍 ${j.property_address}` : "";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const workers = (j.work_order_assignments ?? [])
            .map((a: any) => a.member_profiles?.name).filter(Boolean).join(", ");
          const crew = workers ? `\n   👷 ${workers}` : "";
          return `• <b>${j.title}</b>${time}${addr}${crew}`;
        });
        await sendTelegram(
          `📅 <b>Schedule for ${fmtDate(today)}</b> — ${todayJobs.length} job${todayJobs.length > 1 ? "s" : ""}\n\n${lines.join("\n\n")}`,
        );
      }
    }

    // This business's own sender and reply-to, not one hardcoded address.
    const from = fromFor(biz);
    const replyTo = biz.email ?? undefined;
    const footer = `${biz.name}${biz.website ? ` · ${biz.website}` : ""}`;

    // ── 2. Worker emails — today's jobs ─────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workerJobMap = new Map<string, { profile: any; jobs: any[] }>();
    for (const job of todayJobs) {
      for (const assignment of job.work_order_assignments ?? []) {
        const profile = assignment.member_profiles;
        if (!profile?.email) continue;
        if (!workerJobMap.has(profile.id)) workerJobMap.set(profile.id, { profile, jobs: [] });
        workerJobMap.get(profile.id)!.jobs.push(job);
      }
    }
    workersEmailed += workerJobMap.size;

    await Promise.all(
      Array.from(workerJobMap.values()).map(async ({ profile, jobs }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const jobRows = jobs.map((j: any) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
            <div style="font-weight:600;color:#111827;font-size:14px;">${j.title}</div>
            ${j.start_time ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">🕐 ${fmt12(j.start_time)}${j.end_time ? ` – ${fmt12(j.end_time)}` : ""}</div>` : ""}
            ${j.property_address ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">📍 ${j.property_address}</div>` : ""}
            ${j.customers?.phone ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">📞 ${j.customers.phone}</div>` : ""}
          </td>
        </tr>`).join("");
        try {
          await resend.emails.send({
            from, replyTo, to: profile.email,
            subject: `Your jobs today — ${fmtDate(today)}`,
            html: `
              <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
                <h1 style="font-size:18px;color:#111827;">Hi ${String(profile.name ?? "").split(" ")[0]}, here's your day</h1>
                <table style="width:100%;border-collapse:collapse;">${jobRows}</table>
                <p style="margin-top:12px;font-size:11px;color:#9ca3af;text-align:center;">${footer}</p>
              </div>`,
          });
        } catch (e) {
          console.error(`[reminders] worker email failed for ${profile.email}:`, e);
        }
      }),
    );

    // ── 3. Customer reminders — tomorrow's jobs ─────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withEmail = tomorrowJobs.filter((j: any) => j.customers?.email);
    customerReminders += withEmail.length;

    await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      withEmail.map(async (j: any) => {
        const cust = j.customers;
        const timeStr = j.start_time
          ? `at <strong style="color:#2563eb;">${fmt12(j.start_time)}${j.end_time ? ` – ${fmt12(j.end_time)}` : ""}</strong>`
          : "tomorrow";
        try {
          await resend.emails.send({
            from, replyTo, to: cust.email,
            subject: `Reminder: ${biz.name} visit tomorrow`,
            html: `
              <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
                <div style="background:#f97316;color:white;padding:16px 24px;border-radius:10px 10px 0 0;">
                  <h1 style="margin:0;font-size:18px;">📅 Your appointment is tomorrow</h1>
                </div>
                <div style="border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 10px 10px;">
                  <p style="font-size:15px;color:#374151;">Hi ${String(cust.name ?? "").split(" ")[0]},</p>
                  <p style="font-size:15px;color:#374151;">This is a reminder that our team will be at <strong>${j.property_address || "your property"}</strong> ${timeStr} for <strong>${j.title}</strong>.</p>
                  <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #e5e7eb;">
                    <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">📅 ${fmtDate(tomorrow)}</p>
                    ${j.start_time ? `<p style="margin:0 0 4px;font-size:14px;color:#6b7280;">🕐 ${fmt12(j.start_time)}${j.end_time ? ` – ${fmt12(j.end_time)}` : ""}</p>` : ""}
                    ${j.property_address ? `<p style="margin:0;font-size:14px;color:#6b7280;">📍 ${j.property_address}</p>` : ""}
                  </div>
                  ${biz.phone ? `<p style="font-size:14px;color:#6b7280;">Need to reschedule? Call us: <a href="tel:${biz.phone.replace(/\s/g, "")}" style="color:#f97316;font-weight:bold;">${biz.phone}</a></p>` : ""}
                </div>
                <p style="margin-top:12px;font-size:11px;color:#9ca3af;text-align:center;">${footer}</p>
              </div>`,
          });
        } catch (e) {
          console.error(`[reminders] customer reminder failed for ${cust.email}:`, e);
        }
      }),
    );

    // ── 4. Mark assignments as reminded ─────────────────────────────────────
    const assignmentIds = todayJobs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .flatMap((j: any) => j.work_order_assignments ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((a: any) => !a.reminder_sent_at)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((a: any) => a.id);

    if (assignmentIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any)
        .from("work_order_assignments")
        .update({ reminder_sent_at: new Date().toISOString() })
        .in("id", assignmentIds);
    }
  }

  return NextResponse.json({
    ok: true,
    businesses: businesses.length,
    today: { date: today, workers_emailed: workersEmailed },
    tomorrow: { date: tomorrow, customer_reminders: customerReminders },
  });
}
