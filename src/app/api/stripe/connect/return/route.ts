import { NextResponse } from "next/server";
import { syncStripeAccountStatus } from "@/lib/actions/stripe";

// Stripe redirects here when the merchant finishes (or abandons) onboarding.
// We pull the freshest state from Stripe so the UI doesn't show stale flags
// while we wait for the account.updated webhook to land.
export async function GET() {
  try {
    await syncStripeAccountStatus();
  } catch {
    // Best-effort — the webhook will catch up if this fails.
  }
  return NextResponse.redirect(new URL("/settings?tab=payments&stripe=connected", process.env.NEXT_PUBLIC_APP_URL || "https://kireihq.com"));
}
