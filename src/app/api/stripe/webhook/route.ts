import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, fromStripeAmount } from "@/lib/stripe";
import { recordStripePayment } from "@/lib/stripe-payments";

export const runtime = "nodejs";
// Disable Next's default body parsing so we get the raw bytes for signature verification.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not set" }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    const raw = await request.text();
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutCompleted(event);
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event);
        break;
      case "account.updated":
        await handleAccountUpdated(event);
        break;
      default:
        // No-op for events we don't act on.
        break;
    }
  } catch (err) {
    console.error("[stripe.webhook] handler failed", event.type, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleAccountUpdated(event: Stripe.Event) {
  const account = event.data.object as Stripe.Account;
  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).from("businesses").update({
    stripe_charges_enabled:   !!account.charges_enabled,
    stripe_payouts_enabled:   !!account.payouts_enabled,
    stripe_details_submitted: !!account.details_submitted,
    stripe_country:           account.country ?? null,
  }).eq("stripe_account_id", account.id);
}

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const connectedAcct = typeof event.account === "string" ? event.account : null;

  // Setup mode = the customer saved a card on file (no payment taken).
  if (session.mode === "setup") {
    await handleCardSaved(session, connectedAcct);
    return;
  }

  if (session.payment_status !== "paid") return;

  const invoiceId = session.metadata?.kirei_invoice_id;
  const businessId = session.metadata?.kirei_business_id;
  if (!invoiceId || !businessId) {
    console.warn("[stripe.webhook] session missing kirei_invoice_id/business_id", session.id);
    return;
  }
  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!piId) {
    console.warn("[stripe.webhook] session has no payment_intent", session.id);
    return;
  }

  const currency = session.currency?.toUpperCase() ?? "USD";
  // Credit the invoice with the face amount; a card surcharge (kirei_amount <
  // amount_total) just covers processing fees and isn't part of the invoice.
  const faceAmount = session.metadata?.kirei_amount != null
    ? Number(session.metadata.kirei_amount)
    : fromStripeAmount(session.amount_total ?? 0, currency);

  const sb = createAdminClient();
  await recordStripePayment(sb, getStripe(), {
    businessId, invoiceId, piId, sessionId: session.id, amount: faceAmount, currency,
    connectedAcct, portalToken: session.metadata?.kirei_portal_token ?? null,
  });
}

/**
 * Off-session autopay charges record themselves inline, but if a
 * payment_intent.succeeded is also delivered here we record it too (idempotent).
 * Only acts on PaymentIntents we tagged with kirei_invoice_id — hosted-Checkout
 * PIs carry no such metadata and are handled via the session event above.
 */
async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const invoiceId = pi.metadata?.kirei_invoice_id;
  const businessId = pi.metadata?.kirei_business_id;
  if (!invoiceId || !businessId) return;

  const connectedAcct = typeof event.account === "string" ? event.account : null;
  const currency = (pi.currency ?? "usd").toUpperCase();
  const faceAmount = pi.metadata?.kirei_amount != null
    ? Number(pi.metadata.kirei_amount)
    : fromStripeAmount(pi.amount_received ?? pi.amount ?? 0, currency);

  const sb = createAdminClient();
  await recordStripePayment(sb, getStripe(), {
    businessId, invoiceId, piId: pi.id, amount: faceAmount, currency,
    connectedAcct, portalToken: pi.metadata?.kirei_portal_token ?? null,
  });
}

/** Persist a newly-saved card on file (from a setup-mode Checkout session). */
async function handleCardSaved(session: Stripe.Checkout.Session, connectedAcct: string | null) {
  const customerId = session.metadata?.kirei_customer_id;
  const businessId = session.metadata?.kirei_business_id;
  if (!customerId || !businessId) {
    console.warn("[stripe.webhook] setup session missing kirei_customer_id/business_id", session.id);
    return;
  }
  const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
  if (!setupIntentId) return;

  const stripe = getStripe();
  const opts = connectedAcct ? { stripeAccount: connectedAcct } : undefined;

  const si = await stripe.setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] }, opts);
  const pm = si.payment_method && typeof si.payment_method === "object"
    ? (si.payment_method as Stripe.PaymentMethod)
    : null;
  const pmId = pm?.id ?? (typeof si.payment_method === "string" ? si.payment_method : null);
  if (!pmId) return;

  const card = pm?.card ?? null;
  const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).from("customers").update({
    stripe_customer_id: stripeCustomerId,
    stripe_payment_method_id: pmId,
    stripe_pm_brand: card?.brand ?? null,
    stripe_pm_last4: card?.last4 ?? null,
    stripe_pm_exp: card ? `${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}` : null,
    autopay_enabled: true,
  }).eq("id", customerId).eq("business_id", businessId);
}
