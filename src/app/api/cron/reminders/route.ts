/**
 * GET /api/cron/reminders
 *
 * Runs daily at 8pm UTC (6am AEST) via Vercel Cron.
 * 1. Sends Telegram to owner: today's full schedule
 * 2. Sends email to each assigned worker: their jobs for today
 * 3. Sends customer reminder emails for today's jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

const BUSINESS_ID = process.env.AGENT_BUSINESS_ID ?? "ff3a47f3-54b0-45e3-b7a9-69ddc9fa787e";
const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID     = process.env.TELEGRAM_CHAT_ID!;
const FROM        = process.env.RESEND_FROM_EMAIL ?? "Crown Roofers <noreply@crownroofers.com.au>";

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
async function getJobsForDate(sb: any, date: string) {
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
    .eq("business_id", BUSINESS_ID)
    .eq("scheduled_date", date)
    .not("status", "eq", "cancelled")
    .order("start_time", { ascending: true, nullsFirst: false });
  return (data ?? []) as any[];
}

export async function GET(req: NextRequest) {
  // Auth: Vercel sets CRON_SECRET, or allow explicit bearer
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const sb = createAdminClient();
  const today    = todayAEST();
  const tomorrow = tomorrowAEST();

  const [todayJobs, tomorrowJobs] = await Promise.all([
    getJobsForDate(sb, today),
    getJobsForDate(sb, tomorrow),
  ]);

  // ── 1. Telegram — today's schedule summary ────────────────────────────────
  if (todayJobs.length === 0) {
    await sendTelegram(`📅 <b>Schedule for ${fmtDate(today)}</b>\n\nNo jobs scheduled today. 🏖️`);
  } else {
    const lines = todayJobs.map((j: any) => {
      const time = j.start_time ? ` · ${fmt12(j.start_time)}${j.end_time ? `–${fmt12(j.end_time)}` : ""}` : "";
      const addr = j.property_address ? `\n   📍 ${j.property_address}` : "";
      const workers = (j.work_order_assignments ?? [])
        .map((a: any) => a.member_profiles?.name).filter(Boolean).join(", ");
      const crew = workers ? `\n   👷 ${workers}` : "";
      return `• <b>${j.title}</b>${time}${addr}${crew}`;
    });
    await sendTelegram(
      `📅 <b>Schedule for ${fmtDate(today)}</b> — ${todayJobs.length} job${todayJobs.length > 1 ? "s" : ""}\n\n${lines.join("\n\n")}`
    );
  }

  // ── 2. Worker emails — today's jobs ───────────────────────────────────────
  // Group jobs by worker
  const workerJobMap = new Map<string, { profile: any; jobs: any[] }>();
  for (const job of todayJobs) {
    for (const assignment of (job.work_order_assignments ?? [])) {
      const profile = assignment.member_profiles;
      if (!profile?.email) continue;
      if (!workerJobMap.has(profile.id)) {
        workerJobMap.set(profile.id, { profile, jobs: [] });
      }
      workerJobMap.get(profile.id)!.jobs.push(job);
    }
  }

  const resend = getResend();
  await Promise.all(
    Array.from(workerJobMap.values()).map(async ({ profile, jobs }) => {
      const jobRows = jobs.map((j: any) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
            <div style="font-weight:600;color:#111827;font-size:14px;">${j.title}</div>
            ${j.start_time ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">🕐 ${fmt12(j.start_time)}${j.end_time ? ` – ${fmt12(j.end_time)}` : ""}</div>` : ""}
            ${j.property_address ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">📍 ${j.property_address}</div>` : ""}
            ${j.customers?.phone ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">📞 ${j.customers.phone}</div>` : ""}
          </td>
        </tr>
      `).join("");

      try {
        await resend.emails.send({
          from: FROM,
          to: profile.email,
          subject: `Your jobs today — ${fmtDate(today)}`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
              <div style="background:#2563eb;color:white;padding:16px 24px;border-radius:10px 10px 0 0;">
                <h1 style="margin:0;font-size:18px;">📅 Your Jobs Today</h1>
                <p style="margin:4px 0 0;opacity:0.85;font-size:14px;">${fmtDate(today)}</p>
              </div>
              <div style="border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 10px 10px;">
                <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${profile.name.split(" ")[0]}, here are your jobs for today:</p>
                <table style="width:100%;border-collapse:collapse;">${jobRows}</table>
                <div style="margin-top:20px;padding:14px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
                  <p style="margin:0;font-size:13px;color:#1e40af;">Questions? Call the office: <a href="tel:+61490688332" style="color:#2563eb;font-weight:bold;">0490 688 332</a></p>
                </div>
              </div>
              <p style="margin-top:12px;font-size:11px;color:#9ca3af;text-align:center;">Crown Roofers · crownroofers.com.au</p>
            </div>
          `,
        });
      } catch (e) {
        console.error(`Worker email failed for ${profile.email}:`, e);
      }
    })
  );

  // ── 3. Customer reminder emails — tomorrow's jobs ─────────────────────────
  await Promise.all(
    tomorrowJobs
      .filter((j: any) => j.customers?.email)
      .map(async (j: any) => {
        const cust = j.customers;
        const timeStr = j.start_time
          ? `at <strong style="color:#2563eb;">${fmt12(j.start_time)}${j.end_time ? ` – ${fmt12(j.end_time)}` : ""}</strong>`
          : "tomorrow";
        try {
          await resend.emails.send({
            from: FROM,
            replyTo: "info@crownroofers.com.au",
            to: cust.email,
            subject: `Reminder: Crown Roofers visit tomorrow`,
            html: `
              <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
                <div style="background:#f97316;color:white;padding:16px 24px;border-radius:10px 10px 0 0;">
                  <h1 style="margin:0;font-size:18px;">📅 Your appointment is tomorrow</h1>
                </div>
                <div style="border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 10px 10px;">
                  <p style="font-size:15px;color:#374151;">Hi ${cust.name.split(" ")[0]},</p>
                  <p style="font-size:15px;color:#374151;">This is a reminder that our team will be at <strong>${j.property_address || "your property"}</strong> ${timeStr} for <strong>${j.title}</strong>.</p>
                  <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #e5e7eb;">
                    <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">📅 ${fmtDate(tomorrow)}</p>
                    ${j.start_time ? `<p style="margin:0 0 4px;font-size:14px;color:#6b7280;">🕐 ${fmt12(j.start_time)}${j.end_time ? ` – ${fmt12(j.end_time)}` : ""}</p>` : ""}
                    ${j.property_address ? `<p style="margin:0;font-size:14px;color:#6b7280;">📍 ${j.property_address}</p>` : ""}
                  </div>
                  <p style="font-size:14px;color:#6b7280;">Need to reschedule? Call us: <a href="tel:+61490688332" style="color:#f97316;font-weight:bold;">0490 688 332</a></p>
                </div>
                <p style="margin-top:12px;font-size:11px;color:#9ca3af;text-align:center;">Crown Roofers · ABN 69 683 690 5 · crownroofers.com.au</p>
              </div>
            `,
          });
        } catch (e) {
          console.error(`Customer reminder failed for ${cust.email}:`, e);
        }
      })
  );

  // ── 4. Mark assignments as reminded ───────────────────────────────────────
  const assignmentIds = todayJobs
    .flatMap((j: any) => j.work_order_assignments ?? [])
    .filter((a: any) => !a.reminder_sent_at)
    .map((a: any) => a.id);

  if (assignmentIds.length > 0) {
    await (sb as any)
      .from("work_order_assignments")
      .update({ reminder_sent_at: new Date().toISOString() })
      .in("id", assignmentIds);
  }

  return NextResponse.json({
    ok: true,
    today: { date: today, jobs: todayJobs.length, workers_emailed: workerJobMap.size },
    tomorrow: { date: tomorrow, customer_reminders: tomorrowJobs.filter((j: any) => j.customers?.email).length },
  });
}
