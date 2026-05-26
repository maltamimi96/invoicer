/**
 * GET /api/public/v1/biz/{slug}/booking-config
 * Public, unauthenticated, CORS-enabled. Returns the tenant's booking config:
 * enabled flag, branding, timezone, required fields, and active appointment
 * types. No PII, no resource details beyond what the widget needs.
 */
import { NextRequest } from "next/server";
import { resolveTenant, json, publicError, preflight, rateLimit, clientIp } from "@/lib/booking/public";
import type { AppointmentType } from "@/types/database";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return preflight(); }

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!rateLimit(`cfg:${clientIp(req)}`, 60, 60_000)) return publicError("Rate limited", 429);

  const tenant = await resolveTenant(slug);
  if (!tenant) return publicError("Booking not available", 404);
  const { businessId, settings, sb } = tenant;

  const [{ data: types }, { data: biz }] = await Promise.all([
    sb.from("appointment_types").select("*").eq("business_id", businessId)
      .eq("active", true).order("sort_order", { ascending: true }),
    sb.from("businesses").select("name, logo_url, primary_color").eq("id", businessId).maybeSingle(),
  ]);

  return json({
    enabled: true,
    business_name: biz?.name ?? null,
    timezone: settings.timezone,
    branding: {
      logo_url: settings.brand_logo_url ?? biz?.logo_url ?? null,
      color: settings.brand_color ?? biz?.primary_color ?? null,
    },
    required_fields: {
      phone: settings.require_phone,
      email: settings.require_email,
      address: settings.require_address,
    },
    confirmation_message: settings.confirmation_message,
    cancellation_window_hours: settings.cancellation_window_hours,
    captcha: settings.captcha_provider
      ? { provider: settings.captcha_provider, site_key: settings.captcha_site_key }
      : null,
    appointment_types: (types ?? []).map((t: AppointmentType) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      duration_minutes: t.duration_minutes,
      price_display: t.price_display,
      color: t.color,
    })),
  });
}
