/**
 * POST /api/public/v1/biz/{slug}/holds
 * Body: { type: appointment_type_id, start: ISO, resource_id }
 * Creates a short-lived (10 min) soft reservation so the slot can't be taken
 * while the customer fills the form. Returns { hold_token, expires_at }.
 */
import { NextRequest } from "next/server";
import { isSlotBookable } from "@/lib/booking/validate";
import {
  resolveTenant, json, publicError, preflight, rateLimit, clientIp, honeypotTripped,
} from "@/lib/booking/public";

export const dynamic = "force-dynamic";
const HOLD_MINUTES = 10;

export async function OPTIONS() { return preflight(); }

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!rateLimit(`hold:${clientIp(req)}`, 30, 60_000)) return publicError("Rate limited", 429);

  const tenant = await resolveTenant(slug);
  if (!tenant) return publicError("Booking not available", 404);
  const { businessId, sb, settings } = tenant;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return publicError("Invalid JSON", 400); }
  if (honeypotTripped(body)) return publicError("Rejected", 400);

  const typeId = String(body.type ?? "");
  const resourceId = String(body.resource_id ?? "");
  const startIso = String(body.start ?? "");
  if (!typeId || !resourceId || !startIso) return publicError("type, resource_id and start are required", 400);

  const start = new Date(startIso);
  if (isNaN(start.getTime())) return publicError("Invalid start", 400);

  // Look up type duration + buffer, validate it belongs to the tenant.
  const { data: type } = await sb.from("appointment_types")
    .select("id, duration_minutes, buffer_minutes, active")
    .eq("id", typeId).eq("business_id", businessId).maybeSingle();
  if (!type || !type.active) return publicError("Appointment type not found", 404);

  // Validate the resource belongs to the tenant.
  const { data: resource } = await sb.from("booking_resources")
    .select("id, active").eq("id", resourceId).eq("business_id", businessId).maybeSingle();
  if (!resource || !resource.active) return publicError("Resource not found", 404);

  const end = new Date(start.getTime() + type.duration_minutes * 60_000);

  // A hold is later trusted by the booking route, which reads its stored
  // start/end verbatim — so if a bogus time can be held, it can be booked.
  // This checks the same thing the booking route does: that the time is one
  // the business actually offered, honouring working hours, blackouts,
  // max_advance_days, and the form's own type/resource restriction (which the
  // per-tenant lookups above don't cover).
  const check = await isSlotBookable(sb, settings, typeId, resourceId, start);
  if (!check.ok) return publicError(check.reason, 409);

  // Re-check the slot is actually free for this resource (appointments + holds + jobs).
  const { data: busy } = await sb.rpc("booking_busy_intervals", {
    p_business_id: businessId,
    p_resource_id: resourceId,
    p_from: start.toISOString(),
    p_to: end.toISOString(),
  });
  const taken = (busy ?? []).some((b: { starts_at: string; ends_at: string }) =>
    new Date(b.starts_at).getTime() < end.getTime() && new Date(b.ends_at).getTime() > start.getTime());
  if (taken) return publicError("Slot no longer available", 409);

  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
  const { data: hold, error } = await sb.from("booking_holds").insert({
    business_id: businessId,
    resource_id: resourceId,
    appointment_type_id: typeId,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    expires_at: expiresAt.toISOString(),
  }).select("hold_token, expires_at").single();
  if (error) return publicError("Could not hold slot", 500);

  return json({ hold_token: hold.hold_token, expires_at: hold.expires_at }, 201);
}
