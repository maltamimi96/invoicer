/**
 * POST /api/public/v1/biz/{slug}/bookings
 * Body: { hold_token?, type, resource_id, start, customer_name, customer_phone?,
 *         customer_email?, customer_address?, notes?, captcha_token?,
 *         idempotency_key? }   (Idempotency-Key header also accepted)
 *
 * Confirms a booking. The DB exclusion constraint is the race guard: a
 * concurrent attempt at the same slot raises 23P01 → we return 409. Optionally
 * creates a Lead / Work Order per booking_settings. Returns confirmation +
 * manage_token for self-serve reschedule/cancel.
 */
import { NextRequest } from "next/server";
import {
  resolveTenant, json, publicError, preflight, rateLimit, clientIp,
  honeypotTripped, verifyCaptcha,
} from "@/lib/booking/public";
import { notifyBookingCreated, fireBookingWebhook } from "@/lib/booking/notify";
import type { Appointment } from "@/types/database";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return preflight(); }

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = clientIp(req);
  if (!rateLimit(`book:${ip}`, 20, 60_000)) return publicError("Rate limited", 429);

  const tenant = await resolveTenant(slug);
  if (!tenant) return publicError("Booking not available", 404);
  const { businessId, settings, sb } = tenant;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return publicError("Invalid JSON", 400); }
  if (honeypotTripped(body)) return publicError("Rejected", 400);

  if (!(await verifyCaptcha(settings, body.captcha_token as string | undefined))) {
    return publicError("CAPTCHA verification failed", 400);
  }

  const idempotencyKey = (req.headers.get("idempotency-key") || (body.idempotency_key as string) || "").trim() || null;

  // Idempotency: short-circuit if we already booked this key.
  if (idempotencyKey) {
    const { data: existing } = await sb.from("appointments")
      .select("id, manage_token, starts_at, ends_at, status")
      .eq("business_id", businessId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing) {
      return json({ ok: true, idempotent: true, appointment: existing, manage_token: existing.manage_token });
    }
  }

  const customerName = String(body.customer_name ?? "").trim();
  if (!customerName) return publicError("customer_name is required", 400);
  const customerPhone = String(body.customer_phone ?? "").trim() || null;
  const customerEmail = String(body.customer_email ?? "").trim() || null;
  const customerAddress = String(body.customer_address ?? "").trim() || null;
  if (settings.require_phone && !customerPhone) return publicError("Phone is required", 400);
  if (settings.require_email && !customerEmail) return publicError("Email is required", 400);
  if (settings.require_address && !customerAddress) return publicError("Address is required", 400);

  // Resolve slot: prefer a hold, else explicit type+resource+start.
  let typeId: string, resourceId: string, start: Date, end: Date;
  const holdToken = String(body.hold_token ?? "").trim();

  if (holdToken) {
    const { data: hold } = await sb.from("booking_holds")
      .select("*").eq("hold_token", holdToken).eq("business_id", businessId).maybeSingle();
    if (!hold || new Date(hold.expires_at).getTime() <= Date.now()) {
      return publicError("Hold expired — please pick a new time", 409);
    }
    typeId = hold.appointment_type_id;
    resourceId = hold.resource_id;
    start = new Date(hold.starts_at);
    end = new Date(hold.ends_at);
  } else {
    typeId = String(body.type ?? "");
    resourceId = String(body.resource_id ?? "");
    const startIso = String(body.start ?? "");
    if (!typeId || !resourceId || !startIso) return publicError("hold_token or (type, resource_id, start) required", 400);
    const { data: type } = await sb.from("appointment_types")
      .select("id, duration_minutes, active").eq("id", typeId).eq("business_id", businessId).maybeSingle();
    if (!type || !type.active) return publicError("Appointment type not found", 404);
    start = new Date(startIso);
    if (isNaN(start.getTime())) return publicError("Invalid start", 400);
    end = new Date(start.getTime() + type.duration_minutes * 60_000);
  }

  // Insert — the exclusion constraint guards concurrency. 23P01 = overlap.
  const { data: appt, error } = await sb.from("appointments").insert({
    business_id: businessId,
    appointment_type_id: typeId,
    resource_id: resourceId,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    customer_address: customerAddress,
    notes: String(body.notes ?? "").trim() || null,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    status: "confirmed",
    source: (body.source as string) === "embed" ? "embed" : "web",
    idempotency_key: idempotencyKey,
  }).select("*").single();

  if (error) {
    if (error.code === "23P01") return publicError("That time was just taken — please pick another", 409);
    if (error.code === "23505") {
      // idempotency race — fetch and return the winner
      const { data: dup } = await sb.from("appointments")
        .select("id, manage_token, starts_at, ends_at, status")
        .eq("business_id", businessId).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (dup) return json({ ok: true, idempotent: true, appointment: dup, manage_token: dup.manage_token });
    }
    console.error("Booking insert error:", error);
    return publicError("Could not complete booking", 500);
  }

  // Consume the hold (best-effort).
  if (holdToken) await sb.from("booking_holds").delete().eq("hold_token", holdToken);

  // Optional CRM side-effects per settings. leads.user_id / work_orders.user_id
  // are NOT NULL, so we attribute these to the business owner.
  let leadId: string | null = null;
  let workOrderId: string | null = null;
  try {
    const { data: biz } = await sb.from("businesses")
      .select("user_id, work_order_prefix, work_order_next_number").eq("id", businessId).single();
    const ownerId: string | null = biz?.user_id ?? null;

    if (settings.create_lead && ownerId) {
      const { data: lead } = await sb.rpc("upsert_lead", {
        p_business_id: businessId, p_user_id: ownerId,
        p_name: customerName, p_email: customerEmail, p_phone: customerPhone,
        p_address: customerAddress, p_suburb: null, p_service: null,
        p_property_type: null, p_timing: null,
        p_notes: `Online booking for ${start.toISOString()}`,
        p_source: "website", p_source_ref: "online-booking",
      }).single();
      leadId = (lead as { id?: string } | null)?.id ?? null;
    }
    if (settings.create_work_order && ownerId) {
      const next = biz?.work_order_next_number ?? 1;
      const number = `${biz?.work_order_prefix ?? "WO"}-${String(next).padStart(4, "0")}`;
      await sb.from("businesses").update({ work_order_next_number: next + 1 }).eq("id", businessId);
      const { data: wo } = await sb.from("work_orders").insert({
        business_id: businessId, user_id: ownerId, number,
        title: `Booking: ${customerName}`,
        status: "draft",
        scheduled_date: start.toISOString().slice(0, 10),
      }).select("id").single();
      workOrderId = (wo as { id?: string } | null)?.id ?? null;
    }
    if (leadId || workOrderId) {
      await sb.from("appointments").update({ lead_id: leadId, work_order_id: workOrderId }).eq("id", appt.id);
    }
  } catch (e) {
    console.error("Booking side-effect error (non-fatal):", e);
  }

  // Audit.
  await sb.from("booking_audit_log").insert({
    business_id: businessId, appointment_id: appt.id, event: "created", actor: "customer",
    detail: { ip, source: appt.source },
  });

  // Notifications (customer + team) and webhooks. Best-effort, awaited so they
  // complete before the serverless function returns.
  const apptRow = { ...(appt as Appointment), lead_id: leadId, work_order_id: workOrderId };
  await notifyBookingCreated(sb, businessId, settings, apptRow).catch(() => undefined);
  await fireBookingWebhook(businessId, settings, "booking.created", {
    id: appt.id, customer_name: customerName, customer_email: customerEmail, customer_phone: customerPhone,
    starts_at: appt.starts_at, ends_at: appt.ends_at, status: appt.status,
    appointment_type_id: typeId, resource_id: resourceId, lead_id: leadId, work_order_id: workOrderId,
  });

  return json({
    ok: true,
    appointment: {
      id: appt.id, starts_at: appt.starts_at, ends_at: appt.ends_at, status: appt.status,
    },
    manage_token: appt.manage_token,
    confirmation_message: settings.confirmation_message,
  }, 201);
}
