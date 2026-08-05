import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { createRevolutSaveCardOrder, toRevolutAmount, type RevolutMode } from "@/lib/revolut";
import { customerAllowsCard } from "@/lib/payment-methods";
import { appUrl } from "@/lib/app-url";

/**
 * Public, token-gated. Sends the customer to Revolut's hosted checkout to put a
 * card on file, mirroring the Stripe save-card route.
 *
 * Revolut has no zero-amount setup equivalent to a Stripe SetupIntent — a card
 * is saved during a real payment. So this takes a genuine amount, defaulting to
 * a small verification charge, and the amount is shown to the customer before
 * they confirm. Storing the token happens in the webhook, not here: only a
 * completed order proves the card is good.
 */
export const dynamic = "force-dynamic";

/** Verification amount when there's no invoice to attach the save to. */
const VERIFY_AMOUNT = 1.0;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const invoiceId = url.searchParams.get("invoice");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const sb = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: link } = await (sb as any).from("customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at")
    .eq("token", token).maybeSingle();
  if (!link || link.revoked_at) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "Token expired" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: business } = await (sb as any).from("businesses")
    .select("name, currency, revolut_enabled, revolut_mode, revolut_secret_enc")
    .eq("id", link.business_id).single();
  if (!business?.revolut_enabled || !business.revolut_secret_enc) {
    return NextResponse.json({ error: "Card payments aren't enabled for this business" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (sb as any).from("customers")
    .select("id, name, email, allowed_payment_methods")
    .eq("id", link.customer_id).eq("business_id", link.business_id).maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (!customerAllowsCard(customer)) {
    return NextResponse.json({ error: "This customer isn't set up for card payments" }, { status: 400 });
  }

  let secret: string;
  try {
    secret = decryptSecret(business.revolut_secret_enc);
  } catch {
    return NextResponse.json({ error: "Payment configuration error" }, { status: 500 });
  }

  // If an invoice was given, save the card while taking that actual payment —
  // no separate verification charge for the customer to query.
  let amount = VERIFY_AMOUNT;
  if (invoiceId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inv } = await (sb as any).from("invoices")
      .select("total, amount_paid").eq("id", invoiceId).eq("business_id", link.business_id).maybeSingle();
    const owing = inv ? Number(inv.total) - Number(inv.amount_paid) : 0;
    if (owing > 0) amount = owing;
  }

  try {
    const order = await createRevolutSaveCardOrder({
      secret,
      mode: (business.revolut_mode ?? "sandbox") as RevolutMode,
      amountMinor: toRevolutAmount(amount),
      currency: business.currency ?? "AUD",
      customerEmail: customer.email,
      customerName: customer.name,
      reference: `savecard:${link.business_id}:${customer.id}`,
      redirectUrl: `${appUrl()}/portal/${token}`,
      description: invoiceId ? "Payment — card saved for future invoices" : "Card verification",
    });

    if (!order.checkout_url) {
      return NextResponse.json({ error: "Revolut didn't return a checkout link" }, { status: 502 });
    }

    // Remember what this order was for, so the webhook knows to store the token
    // rather than treating it as an ordinary payment.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).from("revolut_orders").insert({
      order_id: order.id,
      business_id: link.business_id,
      customer_id: customer.id,
      invoice_id: invoiceId ?? null,
      amount,
      currency: business.currency ?? "AUD",
      portal_token: token,
      purpose: "save_card",
    });

    return NextResponse.redirect(order.checkout_url);
  } catch (e) {
    // Surface Revolut's own message — a rejected field or an unsupported
    // currency needs to be readable, not swallowed into a generic 500.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't start the card setup" },
      { status: 502 },
    );
  }
}
