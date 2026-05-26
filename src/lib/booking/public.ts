/**
 * Shared helpers for the public, slug-scoped booking API.
 *
 * These endpoints are UNAUTHENTICATED (customers), so every read/write must:
 *   - resolve exactly ONE tenant by slug (booking_business_for_slug),
 *   - be CORS-enabled (embeds run on the business's own domain),
 *   - rate-limit + honeypot + optional CAPTCHA on writes,
 *   - never leak cross-tenant data or resource PII.
 *
 * All DB access uses the service-role admin client (RLS is bypassed, so EVERY
 * query MUST filter by the resolved business_id).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BookingSettings } from "@/types/database";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}
export function publicError(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status, headers: CORS_HEADERS });
}
export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Resolve an enabled booking slug → { businessId, settings }, or null. */
export async function resolveTenant(slug: string): Promise<{
  businessId: string; settings: BookingSettings;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any;
} | null> {
  // Booking tables aren't in the generated Database type; cast to any (matches
  // the repo-wide tbl()/(sb as any) convention for newer tables).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;
  const { data: bizId } = await sb.rpc("booking_business_for_slug", { p_slug: slug.toLowerCase() });
  if (!bizId) return null;
  const { data: settings } = await sb
    .from("booking_settings").select("*").eq("business_id", bizId).maybeSingle();
  if (!settings || !settings.enabled) return null;
  return { businessId: bizId as string, settings: settings as BookingSettings, sb };
}

/** Best-effort in-memory IP rate limiter. Fluid Compute reuses instances so this
 *  catches bursts; CAPTCHA + idempotency + per-day caps are the real guards. */
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.reset) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  if (rec.n >= limit) return false;
  rec.n++;
  return true;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

/** Verify a CAPTCHA token against the business's configured provider. Returns
 *  true when no provider is configured (CAPTCHA is opt-in per tenant). */
export async function verifyCaptcha(settings: BookingSettings, token: string | undefined): Promise<boolean> {
  if (!settings.captcha_provider || !settings.captcha_secret_key) return true; // not enforced
  if (!token) return false;
  const endpoint = settings.captcha_provider === "hcaptcha"
    ? "https://hcaptcha.com/siteverify"
    : "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: settings.captcha_secret_key, response: token }),
    });
    const data = (await res.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}

/** Honeypot: a hidden field bots fill in. Any non-empty value = reject. */
export function honeypotTripped(body: Record<string, unknown>): boolean {
  const hp = body?.["company_website"] ?? body?.["hp"];
  return typeof hp === "string" && hp.trim().length > 0;
}
