import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, fromStripeAmount } from "@/lib/stripe";
import { dispatchWebhook } from "@/lib/webhooks";

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

  const sb = createAdminClient();
  const stripe = getStripe();

  // Fees live on the connected account's charge. Read them robustly:
  //  - Stripe processing fee → the charge's balance_transaction.fee
  //  - Platform fee → charge.application_fee_amount (a plain integer that's
  //    always set when we charged a fee — far more reliable than expanding the
  //    application_fee OBJECT, which is platform-owned and often returns null
  //    when fetched through the connected account).
  const connectedAcct = typeof event.account === "string" ? event.account : null;
  let stripeFee = 0;
  let applicationFee = 0;
  try {
    const pi = await stripe.paymentIntents.retrieve(
      piId,
      { expand: ["latest_charge.balance_transaction"] },
      connectedAcct ? { stripeAccount: connectedAcct } : undefined,
    );
    const charge = pi.latest_charge && typeof pi.latest_charge === "object"
      ? (pi.latest_charge as Stripe.Charge)
      : null;
    if (charge) {
      const bt = charge.balance_transaction && typeof charge.balance_transaction === "object"
        ? (charge.balance_transaction as Stripe.BalanceTransaction)
        : null;
      if (bt) stripeFee = fromStripeAmount(bt.fee, bt.currency.toUpperCase());
      if (charge.application_fee_amount != null) {
        applicationFee = fromStripeAmount(
          charge.application_fee_amount,
          (charge.currency || session.currency || "usd").toUpperCase(),
        );
      }
    }
    // TEMP: confirm capture on the next test payment; removed once verified.
    console.log("[stripe.webhook] fees", { connectedAcct: !!connectedAcct, charge: !!charge, stripeFee, applicationFee });
  } catch (err) {
    console.warn("[stripe.webhook] couldn't read fees", err);
  }

  const currency = session.currency?.toUpperCase() ?? "USD";
  const amount = fromStripeAmount(session.amount_total ?? 0, currency);

  // Idempotent insert — unique index on (business_id, provider_payment_id)
  // means a redelivered event silently no-ops on conflict.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (sb as any).from("payments")
    .select("id")
    .eq("business_id", businessId)
    .eq("provider_payment_id", piId)
    .maybeSingle();
  if (existing) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice } = await (sb as any).from("invoices")
    .select("id, total, amount_paid, parent_invoice_id, user_id, status, number, customer_id")
    .eq("id", invoiceId)
    .eq("business_id", businessId)
    .single();
  if (!invoice) {
    console.warn("[stripe.webhook] invoice not found", invoiceId);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).from("payments").insert({
    invoice_id: invoiceId,
    business_id: businessId,
    user_id: invoice.user_id,
    amount,
    date: new Date().toISOString().slice(0, 10),
    method: "Stripe (card)",
    reference: piId,
    notes: null,
    provider: "stripe",
    provider_payment_id: piId,
    provider_session_id: session.id,
    provider_fee: stripeFee || null,
    provider_platform_fee: applicationFee || null,
  });

  // Recompute amount_paid on this invoice from truth (direct payments + child
  // collections). Mirrors src/lib/actions/invoices.ts addPayment() exactly so
  // progress / deposit invoices reconcile the same way.
  await recomputeInvoice(sb, businessId, invoiceId, invoice.total);

  // Roll up to a parent invoice if this is a deposit/child. The DB trigger
  // trg_reconcile_parent_invoice will also do this — calling it explicitly
  // here keeps behavior identical to the cookie-bound addPayment().
  if (invoice.parent_invoice_id) {
    await recomputeParent(sb, businessId, invoice.parent_invoice_id);
  }

  // Notify any subscribed webhooks the merchant has configured.
  try {
    dispatchWebhook(businessId, "payment.received", {
      invoice_id: invoiceId,
      amount,
      provider: "stripe",
      stripe_payment_intent_id: piId,
    });
  } catch { /* never blocks */ }

  // Email the customer a branded receipt — best-effort, never blocks the webhook.
  try {
    await sendPaymentReceipt(sb, {
      businessId,
      invoiceId,
      amount,
      portalToken: session.metadata?.kirei_portal_token ?? null,
    });
  } catch (err) {
    console.warn("[stripe.webhook] receipt email failed", err);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendPaymentReceipt(sb: any, opts: { businessId: string; invoiceId: string; amount: number; portalToken: string | null }) {
  // Re-read the invoice AFTER recompute so the receipt shows the correct
  // running total + remaining balance.
  const { data: invoice } = await sb.from("invoices")
    .select("id, number, total, amount_paid, customer_id")
    .eq("id", opts.invoiceId).eq("business_id", opts.businessId).single();
  if (!invoice) return;

  const [{ data: business }, { data: customer }] = await Promise.all([
    sb.from("businesses").select("name, email, phone, currency").eq("id", opts.businessId).single(),
    invoice.customer_id
      ? sb.from("customers").select("name, email").eq("id", invoice.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!customer?.email) return; // nowhere to send it

  const { getResolvedEmailTemplate } = await import("@/lib/emails/templates");
  const { paymentReceiptEmailHtml, paymentReceiptEmailSubject } = await import("@/lib/emails/payment-receipt");
  const { sendEmail, buildBusinessFrom } = await import("@/lib/email");

  const template = await getResolvedEmailTemplate(sb, opts.businessId, "payment_receipt");
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  const portalUrl = opts.portalToken && base ? `${base}/portal/${opts.portalToken}/invoice/${invoice.id}` : null;
  const args = {
    invoice, customer, business,
    amount: opts.amount,
    paymentDate: new Date().toISOString(),
    paymentMethod: "Stripe (card)",
  };

  await sendEmail({
    to: customer.email,
    subject: paymentReceiptEmailSubject(args, template),
    html: paymentReceiptEmailHtml({ ...args, portalUrl, template }),
    from: business?.name ? buildBusinessFrom({ name: business.name, localPart: "invoices" }) : undefined,
    replyTo: business?.email || undefined,
    tags: { business_id: opts.businessId, doc_type: "payment_receipt", doc_id: invoice.id },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recomputeInvoice(sb: any, businessId: string, invoiceId: string, invoiceTotal: number) {
  const [{ data: directs }, { data: childCollections }] = await Promise.all([
    sb.from("payments").select("amount").eq("invoice_id", invoiceId).eq("business_id", businessId),
    sb.from("invoices").select("amount_paid").eq("parent_invoice_id", invoiceId).eq("business_id", businessId),
  ]);
  const direct = (directs ?? []).reduce((s: number, r: { amount: unknown }) => s + Number(r.amount ?? 0), 0);
  const childSum = (childCollections ?? []).reduce((s: number, r: { amount_paid: unknown }) => s + Number(r.amount_paid ?? 0), 0);
  const total = Number(invoiceTotal);
  const newPaid = direct + childSum;
  const newStatus = newPaid >= total - 0.01 ? "paid" : "partial";
  await sb.from("invoices").update({ amount_paid: newPaid, status: newStatus }).eq("id", invoiceId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recomputeParent(sb: any, businessId: string, parentId: string) {
  const [{ data: siblings }, { data: parentDirects }, { data: parentRow }] = await Promise.all([
    sb.from("invoices").select("amount_paid").eq("parent_invoice_id", parentId).eq("business_id", businessId),
    sb.from("payments").select("amount").eq("invoice_id", parentId).eq("business_id", businessId),
    sb.from("invoices").select("total, status").eq("id", parentId).eq("business_id", businessId).maybeSingle(),
  ]);
  if (!parentRow) return;
  const collectedChildren = (siblings ?? []).reduce((s: number, r: { amount_paid: unknown }) => s + Number(r.amount_paid ?? 0), 0);
  const direct = (parentDirects ?? []).reduce((s: number, r: { amount: unknown }) => s + Number(r.amount ?? 0), 0);
  const totalCollected = direct + collectedChildren;
  const parentTotal = Number(parentRow.total ?? 0);
  const fullyCovered = totalCollected >= parentTotal - 0.01;
  let nextStatus = parentRow.status as string;
  if (nextStatus !== "cancelled" && nextStatus !== "draft") {
    if (fullyCovered)               nextStatus = "paid";
    else if (totalCollected > 0.01) nextStatus = "partial";
  }
  await sb.from("invoices").update({ amount_paid: totalCollected, status: nextStatus }).eq("id", parentId);
}
