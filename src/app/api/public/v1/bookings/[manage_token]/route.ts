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
import type { Appointment, BookingSettings } from "@/types/database";

export const dynamic = "force-dynamic";

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
  return json({
    appointment: publicView(appt),
    slug: settings.slug,
    timezone: settings.timezone,
    appointment_type_id: appt.appointment_type_id,
    cancellation_window_hours: settings.cancellation_window_hours,
    can_cancel: (new Date(appt.starts_at).getTime() - Date.now()) / 3_600_000 >= settings.cancellation_window_hours,
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

  const durationMs = new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime();
  const newEnd = new Date(newStart.getTime() + durationMs);
  const resourceId = String(body.resource_id ?? appt.resource_id);

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

  await sb.from("booking_audit_log").insert({
    business_id: appt.business_id, appointment_id: appt.id, event: "rescheduled", actor: "customer",
    detail: { from: appt.starts_at, to: newStart.toISOString() },
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

  await sb.from("booking_audit_log").insert({
    business_id: appt.business_id, appointment_id: appt.id, event: "cancelled", actor: "customer",
  });
  return json({ ok: true, appointment: publicView(updated as Appointment) });
}
