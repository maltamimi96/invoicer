import { NextResponse, type NextRequest } from "next/server";
import { customerKey, saveCardSessionKey } from "@/lib/payments/idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { customerAllowsCard } from "@/lib/payment-methods";

/**
 * Public, token-gated. Sends the customer to Stripe's hosted card-setup page to
 * save a card on file for automatic payments. On completion the webhook
 * (checkout.session.completed, mode=setup) stores the payment method + enables
 * autopay. We create/reuse a Stripe Customer ON THE CONNECTED ACCOUNT, since
 * that's where direct charges (and therefore the saved card) live.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const invoiceId = url.searchParams.get("invoice"); // optional, for return redirect
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const sb = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: link } = await (sb as any).from("customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!link || link.revoked_at) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "Token expired" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: business } = await (sb as any).from("businesses")
    .select("name, stripe_account_id, stripe_charges_enabled")
    .eq("id", link.business_id).single();
  if (!business?.stripe_account_id || !business.stripe_charges_enabled) {
    return NextResponse.json({ error: "Card payments aren't enabled for this business" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (sb as any).from("customers")
    .select("id, name, email, stripe_customer_id, allowed_payment_methods")
    .eq("id", link.customer_id).maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (!customerAllowsCard(customer.allowed_payment_methods)) {
    return NextResponse.json({ error: "Card payment is disabled for this account" }, { status: 403 });
  }

  const stripe = getStripe();
  const acctOpts = { stripeAccount: business.stripe_account_id as string };

  // Ensure a Stripe Customer exists on the connected account.
  let stripeCustomerId = customer.stripe_customer_id as string | null;
  if (!stripeCustomerId) {
    const created = await stripe.customers.create(
      {
        name: customer.name || undefined,
        email: customer.email || undefined,
        metadata: { kirei_customer_id: customer.id, kirei_business_id: link.business_id },
      },
      // No date component: a Stripe customer is created once, ever. A rolling
      // key would let the same customer be duplicated on the connected account.
      { ...acctOpts, idempotencyKey: customerKey(link.business_id, customer.id) },
    );
    stripeCustomerId = created.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).from("customers").update({ stripe_customer_id: stripeCustomerId }).eq("id", customer.id);
  }

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || `${url.protocol}//${url.host}`;
  const ret = invoiceId ? `/portal/${token}/invoice/${invoiceId}` : `/portal/${token}`;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "setup",
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      success_url: `${base}${ret}?card_saved=1`,
      cancel_url: `${base}${ret}?card_cancelled=1`,
      metadata: {
        kirei_customer_id: customer.id,
        kirei_business_id: link.business_id,
      },
    },
    // Also a GET handler — a prefetch or a refresh must not mint a second
    // setup session for the same customer on the same day.
    { ...acctOpts, idempotencyKey: saveCardSessionKey(customer.id) },
  );

  if (!session.url) {
    return NextResponse.json({ error: "Stripe didn't return a setup URL" }, { status: 500 });
  }
  return NextResponse.redirect(session.url, { status: 303 });
}
