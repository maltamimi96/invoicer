import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, toStripeAmount, computeApplicationFeeAmount, computeSurcharge } from "@/lib/stripe";
import { customerAllowsCard } from "@/lib/payment-methods";
import { checkoutSessionKey } from "@/lib/payments/idempotency";

/**
 * Public — token-gated. The customer portal hits this with ?invoice=<id>&token=<portal-token>
 * to start a Stripe Checkout Session on the connected account. We redirect
 * the browser straight to Stripe's hosted page.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const invoiceId = url.searchParams.get("invoice");
  const token = url.searchParams.get("token");
  if (!invoiceId || !token) {
    return NextResponse.json({ error: "Missing invoice or token" }, { status: 400 });
  }

  const sb = createAdminClient();

  // Validate the portal token first — this gates the whole route.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: link } = await (sb as any).from("customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!link || link.revoked_at) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "Token expired" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice } = await (sb as any).from("invoices")
    .select("id, number, total, amount_paid, status, customer_id, business_id")
    .eq("id", invoiceId)
    .eq("business_id", link.business_id)
    .eq("customer_id", link.customer_id)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: business } = await (sb as any).from("businesses")
    .select("name, currency, stripe_account_id, stripe_charges_enabled, platform_fee_percent, card_surcharge_enabled, card_surcharge_percent, card_surcharge_fixed")
    .eq("id", link.business_id)
    .single();
  if (!business?.stripe_account_id || !business.stripe_charges_enabled) {
    return NextResponse.json({ error: "Card payments aren't enabled for this business" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (sb as any).from("customers")
    .select("email, name, allowed_payment_methods")
    .eq("id", link.customer_id)
    .maybeSingle();

  // Enforce the per-customer allow-list — card may be disabled for this customer.
  if (!customerAllowsCard(customer?.allowed_payment_methods)) {
    return NextResponse.json({ error: "Card payment isn't available for this account" }, { status: 403 });
  }

  const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid ?? 0));
  if (balance < 0.5) {
    return NextResponse.json({ error: "Nothing left to pay" }, { status: 400 });
  }

  const currency = (business.currency || "GBP").toLowerCase();
  const amountUnit = toStripeAmount(balance, currency);
  const applicationFee = computeApplicationFeeAmount(balance, currency, business.platform_fee_percent != null ? Number(business.platform_fee_percent) : null);

  // Optional card surcharge passed to the customer (added on top of the balance).
  const surcharge = computeSurcharge(balance, {
    enabled: business.card_surcharge_enabled,
    percent: business.card_surcharge_percent,
    fixed: business.card_surcharge_fixed,
  });

  const stripe = getStripe();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || `${url.protocol}//${url.host}`;

  const lineItems: Array<{ price_data: { currency: string; product_data: { name: string }; unit_amount: number }; quantity: number }> = [{
    price_data: { currency, product_data: { name: `Invoice ${invoice.number}` }, unit_amount: amountUnit },
    quantity: 1,
  }];
  if (surcharge > 0) {
    lineItems.push({
      price_data: { currency, product_data: { name: "Card processing fee" }, unit_amount: toStripeAmount(surcharge, currency) },
      quantity: 1,
    });
  }

  // Direct charge on the connected account — the merchant owns the payment,
  // Kirei takes application_fee. This is the standard Connect Standard flow.
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    payment_intent_data: applicationFee > 0 ? { application_fee_amount: applicationFee } : undefined,
    customer_email: customer?.email || undefined,
    success_url: `${baseUrl}/portal/${token}/invoice/${invoice.id}?paid=1`,
    cancel_url:  `${baseUrl}/portal/${token}/invoice/${invoice.id}?cancelled=1`,
    metadata: {
      kirei_invoice_id: invoice.id,
      kirei_business_id: invoice.business_id,
      kirei_portal_token: token,
      kirei_balance: String(balance),
      // Amount to credit the invoice (excludes the surcharge, which just covers fees).
      kirei_amount: String(balance),
      kirei_surcharge: String(surcharge),
    },
  }, {
    stripeAccount: business.stripe_account_id,
    // This handler is a GET, so a link prefetcher or a refresh can fire it more
    // than once. Same invoice + same balance + same day is one session.
    idempotencyKey: checkoutSessionKey(invoice.id, toStripeAmount(balance, currency)),
  });

  if (!session.url) {
    return NextResponse.json({ error: "Stripe didn't return a session URL" }, { status: 500 });
  }
  return NextResponse.redirect(session.url, { status: 303 });
}
