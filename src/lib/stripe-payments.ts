/**
 * Shared Stripe payment recording — used by both the webhook (hosted Checkout)
 * and the off-session autopay charge engine, so a payment is recorded exactly
 * one way no matter how it was taken.
 *
 * Idempotent: keyed on (business_id, provider_payment_id) which has a unique
 * index, so a redelivered webhook + an inline record of the same PaymentIntent
 * can't double-insert.
 */

import type Stripe from "stripe";
import { fromStripeAmount } from "@/lib/stripe";
import { dispatchWebhook } from "@/lib/webhooks";

interface RecordOpts {
  businessId: string;
  invoiceId: string;
  piId: string;
  /** Checkout session id, if the payment came via hosted Checkout. */
  sessionId?: string | null;
  amount: number;
  currency: string;
  /** Connected account the charge lives on (for fee lookup). */
  connectedAcct?: string | null;
  /** Portal token for the receipt's "view invoice" link, if available. */
  portalToken?: string | null;
}

/** Pull the Stripe processing fee + platform application fee for a PaymentIntent. */
async function lookupFees(
  stripe: Stripe,
  piId: string,
  connectedAcct: string | null | undefined,
  fallbackCurrency: string,
): Promise<{ stripeFee: number; applicationFee: number }> {
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
      if (charge.application_fee_amount != null) {
        applicationFee = fromStripeAmount(charge.application_fee_amount, (charge.currency || fallbackCurrency).toUpperCase());
      }
      let bt = charge.balance_transaction && typeof charge.balance_transaction === "object"
        ? (charge.balance_transaction as Stripe.BalanceTransaction)
        : null;
      if (!bt && typeof charge.balance_transaction === "string") {
        bt = await stripe.balanceTransactions.retrieve(
          charge.balance_transaction,
          undefined,
          connectedAcct ? { stripeAccount: connectedAcct } : undefined,
        );
      }
      if (bt) stripeFee = fromStripeAmount(bt.fee, bt.currency.toUpperCase());
    }
  } catch (err) {
    console.warn("[stripe] couldn't read fees", err);
  }
  return { stripeFee, applicationFee };
}

/**
 * Record a successful Stripe payment against an invoice (idempotent), recompute
 * the invoice + any parent rollup, fire the merchant webhook, and email the
 * customer a receipt. Returns true if a new payment row was written.
 */
/**
 * Drop cached renders of anything that shows this invoice's balance.
 *
 * Without this the dashboard keeps serving a paid invoice as unpaid until
 * something else happens to revalidate — which is what "I had to refresh"
 * looks like. Best-effort: a webhook must never fail because a cache tag
 * didn't clear, or the provider retries a payment we already recorded.
 */
async function revalidateInvoiceViews(invoiceId: string): Promise<void> {
  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
  } catch { /* not in a revalidatable context — nothing to do */ }
}

export async function recordStripePayment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  stripe: Stripe,
  opts: RecordOpts,
): Promise<boolean> {
  const { businessId, invoiceId, piId } = opts;

  // Idempotency: bail if this PaymentIntent is already recorded.
  const { data: existing } = await sb.from("payments")
    .select("id").eq("business_id", businessId).eq("provider_payment_id", piId).maybeSingle();
  if (existing) return false;

  const { data: invoice } = await sb.from("invoices")
    .select("id, total, amount_paid, parent_invoice_id, user_id, status, number, customer_id")
    .eq("id", invoiceId).eq("business_id", businessId).single();
  if (!invoice) {
    console.warn("[stripe] invoice not found for payment", invoiceId);
    return false;
  }

  const { stripeFee, applicationFee } = await lookupFees(stripe, piId, opts.connectedAcct, opts.currency);

  const { error: insErr } = await sb.from("payments").insert({
    invoice_id: invoiceId,
    business_id: businessId,
    user_id: invoice.user_id,
    amount: opts.amount,
    date: new Date().toISOString().slice(0, 10),
    method: "Stripe (card)",
    reference: piId,
    notes: null,
    provider: "stripe",
    provider_payment_id: piId,
    provider_session_id: opts.sessionId ?? null,
    provider_fee: stripeFee || null,
    provider_platform_fee: applicationFee || null,
  });
  // A concurrent insert (webhook + inline race) trips the unique index — treat
  // the conflict as "already recorded" and stop.
  if (insErr) {
    if (insErr.code === "23505") return false;
    throw insErr;
  }

  await recomputeInvoice(sb, businessId, invoiceId, invoice.total);
  if (invoice.parent_invoice_id) await recomputeParent(sb, businessId, invoice.parent_invoice_id);
  await revalidateInvoiceViews(invoiceId);

  try {
    dispatchWebhook(businessId, "payment.received", {
      invoice_id: invoiceId, amount: opts.amount, provider: "stripe", stripe_payment_intent_id: piId,
    });
  } catch { /* never blocks */ }

  try {
    await sendPaymentReceipt(sb, { businessId, invoiceId, amount: opts.amount, portalToken: opts.portalToken ?? null });
  } catch (err) {
    console.warn("[stripe] receipt email failed", err);
  }

  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendPaymentReceipt(sb: any, opts: { businessId: string; invoiceId: string; amount: number; portalToken: string | null }) {
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
  if (!customer?.email) return;

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
