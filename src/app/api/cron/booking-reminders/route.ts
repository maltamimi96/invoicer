/**
 * GET /api/cron/booking-reminders  (Vercel Cron, every 15 min)
 *
 * 1. Expires stale booking_holds (booking_expire_holds RPC).
 * 2. Sends due reminders: for each upcoming confirmed appointment, for each
 *    reminder offset on its business, once now passes (starts_at − offset) and
 *    that offset hasn't been sent yet, send the reminder + log + webhook.
 *
 * Dedupe via booking_audit_log (event='reminder', detail.offset).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyBookingReminder, fireBookingWebhook } from "@/lib/booking/notify";
import type { Appointment, BookingForm } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Light gate: allow Vercel Cron, or a matching CRON_SECRET if configured.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const ok = req.headers.get("authorization") === `Bearer ${secret}` || req.headers.get("x-vercel-cron") !== null;
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  // 1. Expire stale holds.
  let expiredHolds = 0;
  try { const { data } = await sb.rpc("booking_expire_holds"); expiredHolds = (data as number) ?? 0; } catch { /* ignore */ }

  // 2. Reminders. Load enabled forms — keyed by id, with a per-business
  //    fallback for legacy appointments that predate form_id.
  const { data: formRows } = await sb.from("booking_forms").select("*").eq("enabled", true);
  const formById = new Map<string, BookingForm>();
  const formByBusiness = new Map<string, BookingForm>();
  let maxOffset = 0;
  for (const f of (formRows ?? []) as BookingForm[]) {
    formById.set(f.id, f);
    if (!formByBusiness.has(f.business_id)) formByBusiness.set(f.business_id, f);
    for (const o of f.reminder_offsets ?? []) maxOffset = Math.max(maxOffset, o);
  }
  if (formById.size === 0) return NextResponse.json({ ok: true, expiredHolds, reminders: 0 });

  const now = Date.now();
  const windowEnd = new Date(now + (maxOffset + 30) * 60_000).toISOString(); // +slack
  const { data: appts } = await sb.from("appointments")
    .select("*")
    .in("business_id", [...formByBusiness.keys()])
    .eq("status", "confirmed")
    .gte("starts_at", new Date(now).toISOString())
    .lte("starts_at", windowEnd);

  let sent = 0;
  for (const appt of (appts ?? []) as Appointment[]) {
    const settings = (appt.form_id ? formById.get(appt.form_id) : null) ?? formByBusiness.get(appt.business_id);
    if (!settings) continue;
    const startMs = new Date(appt.starts_at).getTime();
    for (const offset of settings.reminder_offsets ?? []) {
      const fireAt = startMs - offset * 60_000;
      if (fireAt > now) continue;            // not due yet
      if (startMs <= now) continue;          // already started
      // Already sent this offset?
      const { data: existing } = await sb.from("booking_audit_log")
        .select("id").eq("appointment_id", appt.id).eq("event", "reminder")
        .filter("detail->>offset", "eq", String(offset)).maybeSingle();
      if (existing) continue;

      await notifyBookingReminder(sb, appt.business_id, settings, appt).catch(() => undefined);
      await sb.from("booking_audit_log").insert({
        business_id: appt.business_id, appointment_id: appt.id, event: "reminder",
        actor: "system", detail: { offset },
      });
      await fireBookingWebhook(appt.business_id, settings, "booking.reminder", {
        id: appt.id, starts_at: appt.starts_at, offset_minutes: offset,
      });
      sent++;
    }
  }

  return NextResponse.json({ ok: true, expiredHolds, reminders: sent });
}
