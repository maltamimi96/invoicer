/**
 * Booking notifications + webhooks. Used by the public API + cron (no auth
 * user), so everything takes an explicit admin client / business id and never
 * relies on session-scoped helpers. Fire-and-forget: never throws to callers.
 */
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { dispatchWebhook } from "@/lib/webhooks";
import type { BookingSettings, Appointment, WebhookEvent } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

interface BizRow { name: string; email: string | null; sms_sender_id: string | null }

function fmtLocal(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

function deriveSenderId(name: string): string {
  return (name.replace(/[^A-Za-z0-9]+/g, "").slice(0, 11)) || "Kirei";
}

async function sendSmsRaw(from: string, to: string, body: string): Promise<void> {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey = process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) return;
  const auth = Buffer.from(`${username}:${apiKey}`).toString("base64");
  await fetch("https://rest.clicksend.com/v3/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({ messages: [{ from, to, body, source: "kirei" }] }),
  }).catch(() => undefined);
}

/** Fire booking.* to both the business_webhooks system and the booking-specific
 *  webhook_url (HMAC-signed) if configured. */
export async function fireBookingWebhook(
  businessId: string, settings: BookingSettings, event: WebhookEvent, data: Record<string, unknown>,
): Promise<void> {
  try { dispatchWebhook(businessId, event, data); } catch { /* never blocks */ }

  if (settings.webhook_url) {
    try {
      const payload = JSON.stringify({ event, business_id: businessId, timestamp: new Date().toISOString(), data });
      const headers: Record<string, string> = { "Content-Type": "application/json", "X-Webhook-Event": event };
      if (settings.webhook_secret) {
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(settings.webhook_secret),
          { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
        headers["X-Webhook-Signature"] = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
      await fetch(settings.webhook_url, { method: "POST", headers, body: payload }).catch(() => undefined);
    } catch { /* swallow */ }
  }
}

async function getBiz(sb: Sb, businessId: string): Promise<BizRow | null> {
  const { data } = await sb.from("businesses").select("name, email, sms_sender_id").eq("id", businessId).maybeSingle();
  return (data as BizRow) ?? null;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kireihq.com";

/** Confirmation on a new booking: customer email/SMS + team email, per settings. */
export async function notifyBookingCreated(sb: Sb, businessId: string, settings: BookingSettings, appt: Appointment): Promise<void> {
  const biz = await getBiz(sb, businessId);
  if (!biz) return;
  const when = fmtLocal(appt.starts_at, settings.timezone);
  const manageUrl = `${APP_URL}/booking/${appt.manage_token}`;
  const from = buildBusinessFrom({ name: biz.name, localPart: "bookings" });

  if (settings.notify_customer_email && appt.customer_email) {
    await sendEmail({
      to: appt.customer_email,
      subject: `Booking confirmed — ${biz.name}`,
      from, replyTo: biz.email ?? undefined,
      tags: { business_id: businessId, doc_type: "custom" },
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
        <h2>You're booked${appt.customer_name ? `, ${appt.customer_name}` : ""}!</h2>
        <p style="font-size:16px"><strong>${when}</strong></p>
        ${settings.confirmation_message ? `<p>${settings.confirmation_message}</p>` : ""}
        <p style="color:#475569;font-size:14px">Need to change it? <a href="${manageUrl}">Manage or cancel your booking</a>.</p>
        <p style="color:#94a3b8;font-size:12px">${biz.name}</p>
      </div>`,
    }).catch(() => undefined);
  }

  if (settings.notify_customer_sms && appt.customer_phone) {
    const fromId = biz.sms_sender_id?.trim() || deriveSenderId(biz.name);
    await sendSmsRaw(fromId, appt.customer_phone, `${biz.name}: your booking is confirmed for ${when}. Manage: ${manageUrl}`);
  }

  if (settings.notify_team_email) {
    const teamTo = settings.team_notify_email || biz.email;
    if (teamTo) {
      await sendEmail({
        to: teamTo,
        subject: `New booking: ${appt.customer_name} — ${when}`,
        from, replyTo: appt.customer_email ?? undefined,
        tags: { business_id: businessId, doc_type: "custom" },
        html: `<div style="font-family:system-ui,sans-serif">
          <h3>New online booking</h3>
          <p><strong>${appt.customer_name}</strong><br>${when}</p>
          <p>${appt.customer_phone ?? ""} ${appt.customer_email ? `· ${appt.customer_email}` : ""}</p>
          ${appt.customer_address ? `<p>${appt.customer_address}</p>` : ""}
          ${appt.notes ? `<p>Notes: ${appt.notes}</p>` : ""}
        </div>`,
      }).catch(() => undefined);
    }
  }
}

/** Reminder before the appointment (customer only). */
export async function notifyBookingReminder(sb: Sb, businessId: string, settings: BookingSettings, appt: Appointment): Promise<void> {
  const biz = await getBiz(sb, businessId);
  if (!biz) return;
  const when = fmtLocal(appt.starts_at, settings.timezone);
  const manageUrl = `${APP_URL}/booking/${appt.manage_token}`;
  const from = buildBusinessFrom({ name: biz.name, localPart: "bookings" });

  if (settings.notify_customer_email && appt.customer_email) {
    await sendEmail({
      to: appt.customer_email,
      subject: `Reminder: your appointment with ${biz.name}`,
      from, replyTo: biz.email ?? undefined,
      tags: { business_id: businessId, doc_type: "custom" },
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
        <h2>Appointment reminder</h2><p style="font-size:16px"><strong>${when}</strong></p>
        <p style="color:#475569;font-size:14px"><a href="${manageUrl}">Manage or cancel</a></p></div>`,
    }).catch(() => undefined);
  }
  if (settings.notify_customer_sms && appt.customer_phone) {
    const fromId = biz.sms_sender_id?.trim() || deriveSenderId(biz.name);
    await sendSmsRaw(fromId, appt.customer_phone, `${biz.name} reminder: appointment ${when}. ${manageUrl}`);
  }
}

/** Cancellation notice (customer + team). */
export async function notifyBookingCancelled(sb: Sb, businessId: string, settings: BookingSettings, appt: Appointment): Promise<void> {
  const biz = await getBiz(sb, businessId);
  if (!biz) return;
  const when = fmtLocal(appt.starts_at, settings.timezone);
  const from = buildBusinessFrom({ name: biz.name, localPart: "bookings" });
  if (settings.notify_customer_email && appt.customer_email) {
    await sendEmail({
      to: appt.customer_email, subject: `Booking cancelled — ${biz.name}`, from, replyTo: biz.email ?? undefined,
      tags: { business_id: businessId, doc_type: "custom" },
      html: `<div style="font-family:system-ui,sans-serif"><h2>Booking cancelled</h2><p>Your appointment for ${when} has been cancelled.</p></div>`,
    }).catch(() => undefined);
  }
  if (settings.notify_team_email) {
    const teamTo = settings.team_notify_email || biz.email;
    if (teamTo) await sendEmail({
      to: teamTo, subject: `Booking cancelled: ${appt.customer_name} — ${when}`, from,
      tags: { business_id: businessId, doc_type: "custom" },
      html: `<div style="font-family:system-ui,sans-serif"><p><strong>${appt.customer_name}</strong> cancelled their ${when} booking.</p></div>`,
    }).catch(() => undefined);
  }
}
