import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, toStripeAmount, computeApplicationFeeAmount } from "@/lib/stripe";

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
    .select("name, currency, stripe_account_id, stripe_charges_enabled, platform_fee_percent")
    .eq("id", link.business_id)
    .single();
  if (!business?.stripe_account_id || !business.stripe_charges_enabled) {
    return NextResponse.json({ error: "Card payments aren't enabled for this business" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (sb as any).from("customers")
    .select("email, name")
    .eq("id", link.customer_id)
    .maybeSingle();

  const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid ?? 0));
  if (balance < 0.5) {
    return NextResponse.json({ error: "Nothing left to pay" }, { status: 400 });
  }

  const currency = (business.currency || "GBP").toLowerCase();
  const amountUnit = toStripeAmount(balance, currency);
  const applicationFee = computeApplicationFeeAmount(balance, currency, business.platform_fee_percent != null ? Number(business.platform_fee_percent) : null);

  const stripe = getStripe();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || `${url.protocol}//${url.host}`;

  // Direct charge on the connected account — the merchant owns the payment,
  // Kirei takes application_fee. This is the standard Connect Standard flow.
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency,
        product_data: { name: `Invoice ${invoice.number}` },
        unit_amount: amountUnit,
      },
      quantity: 1,
    }],
    payment_intent_data: applicationFee > 0 ? { application_fee_amount: applicationFee } : undefined,
    customer_email: customer?.email || undefined,
    success_url: `${baseUrl}/portal/${token}/invoice/${invoice.id}?paid=1`,
    cancel_url:  `${baseUrl}/portal/${token}/invoice/${invoice.id}?cancelled=1`,
    metadata: {
      kirei_invoice_id: invoice.id,
      kirei_business_id: invoice.business_id,
      kirei_portal_token: token,
      kirei_balance: String(balance),
    },
  }, {
    stripeAccount: business.stripe_account_id,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Stripe didn't return a session URL" }, { status: 500 });
  }
  return NextResponse.redirect(session.url, { status: 303 });
}
