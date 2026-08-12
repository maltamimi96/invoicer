/**
 * Booking notifications + webhooks. Used by the public API + cron (no auth
 * user), so everything takes an explicit admin client / business id and never
 * relies on session-scoped helpers. Fire-and-forget: never throws to callers.
 */
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { esc } from "@/lib/outreach/render";
import { clickSendSend, deriveSenderId } from "@/lib/sms";
import { dispatchWebhook } from "@/lib/webhooks";
import { bookingEmailHtml, type BookingEmailKind } from "@/lib/emails/booking";
import type { BookingSettings, Appointment, WebhookEvent } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

interface BizRow {
  name: string; email: string | null; sms_sender_id: string | null;
  logo_url: string | null; accent_color: string | null; phone: string | null;
}

/** Resolve the service name + duration and resource display name for an appt. */
async function apptContext(sb: Sb, appt: Appointment): Promise<{ serviceName: string | null; durationMin: number | null; resourceName: string | null }> {
  const [type, resource] = await Promise.all([
    appt.appointment_type_id
      ? sb.from("appointment_types").select("name, duration_minutes").eq("id", appt.appointment_type_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("booking_resources").select("display_name").eq("id", appt.resource_id).maybeSingle(),
  ]);
  const durFromTimes = Math.round((new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()) / 60000);
  return {
    serviceName: type.data?.name ?? null,
    durationMin: type.data?.duration_minutes ?? durFromTimes,
    resourceName: resource.data?.display_name ?? null,
  };
}

function fmtLocal(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

async function sendSmsRaw(from: string, to: string, body: string): Promise<void> {
  // Shared with actions/sms.ts — this used to be a second, subtly different
  // copy of the same HTTP call.
  await clickSendSend({ from, to, body });
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
  const { data } = await sb.from("businesses")
    .select("name, email, sms_sender_id, logo_url, accent_color, phone").eq("id", businessId).maybeSingle();
  return (data as BizRow) ?? null;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kireihq.com";

/** Build a branded booking email for the given kind. */
async function bookingEmail(sb: Sb, biz: BizRow, settings: BookingSettings, appt: Appointment, kind: BookingEmailKind, manageUrl: string | null): Promise<string> {
  const { serviceName, durationMin, resourceName } = await apptContext(sb, appt);
  return bookingEmailHtml({
    kind, businessName: biz.name, logoUrl: biz.logo_url, accent: biz.accent_color || "#1f8f86",
    customerName: appt.customer_name, serviceName, durationMin, resourceName,
    address: appt.customer_address, notes: appt.notes,
    whenText: fmtLocal(appt.starts_at, settings.timezone),
    manageUrl, businessEmail: biz.email, businessPhone: biz.phone,
    customMessage: kind === "confirmed" ? settings.confirmation_message : null,
  });
}

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
      html: await bookingEmail(sb, biz, settings, appt, "confirmed", manageUrl),
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
        // Every field here was typed by an anonymous member of the public on
        // the booking page. Raw, `notes` alone is enough to put a live link
        // into the owner's inbox inside an email they trust.
        html: `<div style="font-family:system-ui,sans-serif">
          <h3>New online booking</h3>
          <p><strong>${esc(appt.customer_name ?? "")}</strong><br>${when}</p>
          <p>${esc(appt.customer_phone ?? "")} ${appt.customer_email ? `· ${esc(appt.customer_email)}` : ""}</p>
          ${appt.customer_address ? `<p>${esc(appt.customer_address)}</p>` : ""}
          ${appt.notes ? `<p>Notes: ${esc(appt.notes)}</p>` : ""}
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
      html: await bookingEmail(sb, biz, settings, appt, "reminder", manageUrl),
    }).catch(() => undefined);
  }
  if (settings.notify_customer_sms && appt.customer_phone) {
    const fromId = biz.sms_sender_id?.trim() || deriveSenderId(biz.name);
    await sendSmsRaw(fromId, appt.customer_phone, `${biz.name} reminder: appointment ${when}. ${manageUrl}`);
  }
}

/**
 * Reschedule notice (customer + team).
 *
 * A customer could move their own appointment and NOBODY was told — not the
 * crew who'd turn up at the old time, not the customer who got no confirmation
 * that it took. Cancellation notified both; reschedule notified neither.
 *
 * Reuses the "confirmed" email body deliberately: it already renders the new
 * time and the manage link, which is precisely what a reschedule confirmation
 * needs to say. Only the subject differs, so nobody mistakes it for a new
 * booking.
 */
export async function notifyBookingRescheduled(
  sb: Sb, businessId: string, settings: BookingSettings, appt: Appointment, previousStart: string,
): Promise<void> {
  const biz = await getBiz(sb, businessId);
  if (!biz) return;
  const when = fmtLocal(appt.starts_at, settings.timezone);
  const wasWhen = fmtLocal(previousStart, settings.timezone);
  const from = buildBusinessFrom({ name: biz.name, localPart: "bookings" });
  const manageUrl = `${APP_URL}/booking/${appt.manage_token}`;

  if (settings.notify_customer_email && appt.customer_email) {
    await sendEmail({
      to: appt.customer_email, subject: `Booking moved to ${when} — ${biz.name}`,
      from, replyTo: biz.email ?? undefined,
      tags: { business_id: businessId, doc_type: "custom" },
      html: await bookingEmail(sb, biz, settings, appt, "confirmed", manageUrl),
    }).catch(() => undefined);
  }
  if (settings.notify_team_email) {
    const teamTo = settings.team_notify_email || biz.email;
    if (teamTo) await sendEmail({
      to: teamTo, subject: `Booking moved: ${appt.customer_name} — ${when}`, from,
      tags: { business_id: businessId, doc_type: "custom" },
      html: `<div style="font-family:system-ui,sans-serif"><p><strong>${appt.customer_name}</strong> moved their booking.</p>`
        + `<p>Was: ${wasWhen}<br>Now: <strong>${when}</strong></p></div>`,
    }).catch(() => undefined);
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
      html: await bookingEmail(sb, biz, settings, appt, "cancelled", null),
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
