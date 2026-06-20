import { NextResponse } from "next/server";
import { createStripeOnboardingLink } from "@/lib/actions/stripe";

// Stripe sends the merchant here when the onboarding link expires. Mint a
// fresh one and bounce them back into the flow.
export async function GET() {
  try {
    const { url } = await createStripeOnboardingLink();
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(new URL("/settings?tab=payments&stripe=error", process.env.NEXT_PUBLIC_APP_URL || "https://kireihq.com"));
  }
}
