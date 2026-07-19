import { NextRequest, NextResponse } from "next/server";

/**
 * Authenticate a cron request. Fails CLOSED.
 *
 * Twelve of the fourteen cron routes previously guarded with:
 *
 *     if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`)
 *
 * — so if the variable was ever unset, renamed, or missing from an environment,
 * the check vanished entirely and the route became a public endpoint. That is
 * the wrong direction to fail for handlers that generate invoices, charge saved
 * cards off-session on a live Stripe integration, and email every tenant's
 * customers from a verified domain.
 *
 * `/api/cron/` is unconditionally public in the middleware, so this function is
 * the only gate these routes have.
 *
 * Returns a NextResponse to return immediately, or null when the caller is
 * authorised.
 */
export function requireCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  // Misconfiguration is a server error, not an open door. 500 rather than 401
  // so it is visibly broken (and shows up in monitoring) instead of looking
  // like a caller problem.
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set — refusing to run");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
