/**
 * GET /api/public/v1/biz/{slug}/availability?type={id}&from={YYYY-MM-DD}&to={YYYY-MM-DD}
 * Public, CORS-enabled. Returns open slots for an appointment type in the
 * business's timezone. Never exposes resource PII beyond display_name.
 */
import { NextRequest } from "next/server";
import { resolveTenant, json, publicError, preflight, rateLimit, clientIp } from "@/lib/booking/public";
import { getAvailability } from "@/lib/booking/availability";
import { zonedDateKey, addDaysKey } from "@/lib/booking/time";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return preflight(); }

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!rateLimit(`avail:${clientIp(req)}`, 120, 60_000)) return publicError("Rate limited", 429);

  const tenant = await resolveTenant(slug);
  if (!tenant) return publicError("Booking not available", 404);
  const { businessId, settings, sb } = tenant;

  const { searchParams } = new URL(req.url);
  const typeId = searchParams.get("type");
  if (!typeId) return publicError("type query param required", 400);

  const todayKey = zonedDateKey(new Date(), settings.timezone);
  const fromKey = searchParams.get("from") || todayKey;
  const toKey = searchParams.get("to") || addDaysKey(fromKey, 7);

  // Guard against absurd ranges.
  if (toKey < fromKey) return publicError("to must be >= from", 400);

  const result = await getAvailability(sb, businessId, typeId, fromKey, toKey);
  if (!result) return publicError("Appointment type not found", 404);

  return json({
    timezone: result.timezone,
    from: fromKey,
    to: toKey,
    slots: result.slots,
  });
}
