/**
 * Token-based self-serve management (no login):
 *   GET    /api/public/v1/bookings/{manage_token}  → view
 *   PATCH  …                                        → reschedule { start, resource_id? }
 *   DELETE …                                        → cancel
 * Respects booking_settings.cancellation_window_hours.
 */
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { json, publicError, preflight, rateLimit, clientIp } from "@/lib/booking/public";
import { fireBookingWebhook, notifyBookingCancelled, notifyBookingRescheduled } from "@/lib/booking/notify";
import { isSlotBookable, workOrderTimesFor } from "@/lib/booking/validate";
import type { Appointment, BookingSettings } from "@/types/database";

export const dynamic = "force-dynamic";

function hexOrNull(c: string | null | undefined): string | null {
  if (!c) return null;
  return /^#?[0-9a-fA-F]{6}$/.test(c) ? (c.startsWith("#") ? c : `#${c}`) : null;
}

export async function OPTIONS() { return preflight(); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function load(sb: any, token: string): Promise<{ appt: Appointment; settings: BookingSettings } | null> {
  const { data: appt } = await sb.from("appointments").select("*").eq("manage_token", token).maybeSingle();
  if (!appt) return null;
  const { data: settings } = await sb.from("booking_settings").select("*").eq("business_id", appt.business_id).maybeSingle();
  if (!settings) return null;
  return { appt: appt as Appointment, settings: settings as BookingSettings };
}

function publicView(appt: Appointment) {
  return {
    id: appt.id, status: appt.status,
    starts_at: appt.starts_at, ends_at: appt.ends_at,
    customer_name: appt.customer_name,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ manage_token: string }> }) {
  const { manage_token } = await params;
  if (!rateLimit(`mng:${clientIp(req)}`, 60, 60_000)) return publicError("Rate limited", 429);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;
  const found = await load(sb, manage_token);
  if (!found) return publicError("Booking not found", 404);
  const { appt, settings } = found;
  const { data: biz } = await sb.from("businesses")
    .select("name, logo_url, accent_color").eq("id", appt.business_id).maybeSingle();
  return json({
    appointment: publicView(appt),
    slug: settings.slug,
    timezone: settings.timezone,
    appointment_type_id: appt.appointment_type_id,
    cancellation_window_hours: settings.cancellation_window_hours,
    can_cancel: (new Date(appt.starts_at).getTime() - Date.now()) / 3_600_000 >= settings.cancellation_window_hours,
    branding: {
      business_name: biz?.name ?? null,
      logo_url: settings.brand_logo_url ?? biz?.logo_url ?? null,
      color: hexOrNull(settings.brand_color) ?? hexOrNull(biz?.accent_color) ?? null,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ manage_token: string }> }) {
  const { manage_token } = await params;
  if (!rateLimit(`mng:${clientIp(req)}`, 30, 60_000)) return publicError("Rate limited", 429);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;
  const found = await load(sb, manage_token);
  if (!found) return publicError("Booking not found", 404);
  const { appt, settings } = found;
  if (appt.status === "cancelled") return publicError("Booking already cancelled", 409);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return publicError("Invalid JSON", 400); }
  const startIso = String(body.start ?? "");
  if (!startIso) return publicError("start is required", 400);
  const newStart = new Date(startIso);
  if (isNaN(newStart.getTime())) return publicError("Invalid start", 400);

  // The cancellation window applies to moving a booking too. It only guarded
  // DELETE, so a customer blocked from cancelling two hours out could simply
  // reschedule to next month instead — same outcome for the crew, window
  // defeated.
  const hoursUntil = (new Date(appt.starts_at).getTime() - Date.now()) / 3_600_000;
  if (hoursUntil < settings.cancellation_window_hours) {
    return publicError(`Changes require at least ${settings.cancellation_window_hours}h notice`, 409);
  }

  const durationMs = new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime();
  const newEnd = new Date(newStart.getTime() + durationMs);
  const resourceId = String(body.resource_id ?? appt.resource_id);

  // resource_id came straight from the request body and went into the update
  // unchecked — a customer could move their job onto any resource id at all,
  // including another business's, orphaning it from the calendar it belonged to.
  if (resourceId !== appt.resource_id) {
    const { data: res } = await sb.from("booking_resources")
      .select("id, active").eq("id", resourceId).eq("business_id", appt.business_id).maybeSingle();
    if (!res || !res.active) return publicError("That resource isn't available", 400);
  }

  // Validate against real availability, not just "does something else overlap".
  // Without it a customer could move their booking to 4am. Appointments made
  // outside a form (admin-created) have no form to validate against; those keep
  // the overlap-only check below rather than becoming unreschedulable.
  const typeId = appt.appointment_type_id;
  if (appt.form_id && typeId) {
    const { data: form } = await sb.from("booking_forms")
      .select("*").eq("id", appt.form_id).eq("business_id", appt.business_id).maybeSingle();
    if (form) {
      const check = await isSlotBookable(sb, form, typeId, resourceId, newStart);
      if (!check.ok) return publicError(check.reason, 409);
    }
  }

  // Free up the old slot first by marking this row rescheduled-exempt: we update
  // in place — the exclusion constraint ignores the row's own prior range since
  // it's the same row. Re-check against OTHER busy intervals defensively.
  const { data: busy } = await sb.rpc("booking_busy_intervals", {
    p_business_id: appt.business_id, p_resource_id: resourceId,
    p_from: newStart.toISOString(), p_to: newEnd.toISOString(),
  });
  const conflict = (busy ?? []).some((b: { starts_at: string; ends_at: string }) => {
    // ignore the appointment's own current interval
    if (b.starts_at === appt.starts_at && b.ends_at === appt.ends_at) return false;
    return new Date(b.starts_at).getTime() < newEnd.getTime() && new Date(b.ends_at).getTime() > newStart.getTime();
  });
  if (conflict) return publicError("That time is not available", 409);

  const { data: updated, error } = await sb.from("appointments").update({
    starts_at: newStart.toISOString(), ends_at: newEnd.toISOString(),
    resource_id: resourceId, status: "confirmed",
  }).eq("id", appt.id).select("*").single();
  if (error) {
    if (error.code === "23P01") return publicError("That time was just taken", 409);
    return publicError("Could not reschedule", 500);
  }

  // Move the generated job with the booking. It used to stay at the old time,
  // so the crew's schedule still showed the original slot — and the stale row
  // kept blocking that window in booking_busy_intervals.
  if (appt.work_order_id) {
    await sb.from("work_orders")
      .update(workOrderTimesFor(newStart, newEnd, settings.timezone))
      .eq("id", appt.work_order_id).eq("business_id", appt.business_id);
  }

  await sb.from("booking_audit_log").insert({
    business_id: appt.business_id, appointment_id: appt.id, event: "rescheduled", actor: "customer",
    detail: { from: appt.starts_at, to: newStart.toISOString() },
  });
  await notifyBookingRescheduled(sb, appt.business_id, settings, updated as Appointment, appt.starts_at)
    .catch(() => undefined);
  await fireBookingWebhook(appt.business_id, settings, "booking.rescheduled", {
    id: appt.id, from: appt.starts_at, to: newStart.toISOString(), resource_id: resourceId,
  });
  return json({ ok: true, appointment: publicView(updated as Appointment) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ manage_token: string }> }) {
  const { manage_token } = await params;
  if (!rateLimit(`mng:${clientIp(req)}`, 30, 60_000)) return publicError("Rate limited", 429);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;
  const found = await load(sb, manage_token);
  if (!found) return publicError("Booking not found", 404);
  const { appt, settings } = found;
  if (appt.status === "cancelled") return json({ ok: true, appointment: publicView(appt) });

  // Enforce cancellation window.
  const hoursUntil = (new Date(appt.starts_at).getTime() - Date.now()) / 3_600_000;
  if (hoursUntil < settings.cancellation_window_hours) {
    return publicError(`Cancellations require at least ${settings.cancellation_window_hours}h notice`, 409);
  }

  const { data: updated, error } = await sb.from("appointments").update({
    status: "cancelled", cancelled_at: new Date().toISOString(),
  }).eq("id", appt.id).select("*").single();
  if (error) return publicError("Could not cancel", 500);

  // Cancel the generated job too. Leaving it live meant a cancelled booking
  // still sat on the crew's schedule and somebody turned up.
  if (appt.work_order_id) {
    await sb.from("work_orders").update({ status: "cancelled" })
      .eq("id", appt.work_order_id).eq("business_id", appt.business_id);
  }

  await sb.from("booking_audit_log").insert({
    business_id: appt.business_id, appointment_id: appt.id, event: "cancelled", actor: "customer",
  });
  await notifyBookingCancelled(sb, appt.business_id, settings, updated as Appointment).catch(() => undefined);
  await fireBookingWebhook(appt.business_id, settings, "booking.cancelled", {
    id: appt.id, starts_at: appt.starts_at, customer_name: appt.customer_name,
  });
  return json({ ok: true, appointment: publicView(updated as Appointment) });
}
