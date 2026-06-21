/**
 * Off-session autopay — charge a customer's saved card for an invoice without
 * them present. Industry-standard Stripe pattern: a confirmed PaymentIntent
 * with off_session:true on the connected account, taking the platform fee.
 *
 * On success it records the payment inline (via the shared recorder) so autopay
 * works with the existing webhook subscription — no extra Stripe event needed.
 * On SCA / decline it returns a typed failure so callers fall back to emailing
 * the customer a manual pay link.
 */

import { getStripe, toStripeAmount, computeApplicationFeeAmount } from "@/lib/stripe";
import { customerAllowsCard } from "@/lib/payment-methods";
import { recordStripePayment } from "@/lib/stripe-payments";

export type ChargeResult =
  | { ok: true; paymentIntentId: string; amount: number }
  | { ok: false; reason: "not_eligible" | "requires_action" | "card_declined" | "error"; message: string };

/**
 * Attempt to charge an invoice's balance to the customer's saved card.
 * `sb` must be an admin (service-role) client — used from server actions, the
 * portal, and cron.
 */
export async function chargeInvoiceToSavedCard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  invoiceId: string,
  businessId: string,
): Promise<ChargeResult> {
  const { data: invoice } = await sb.from("invoices")
    .select("id, number, total, amount_paid, status, customer_id")
    .eq("id", invoiceId).eq("business_id", businessId).maybeSingle();
  if (!invoice) return { ok: false, reason: "not_eligible", message: "Invoice not found" };
  if (invoice.status === "cancelled" || invoice.status === "draft") {
    return { ok: false, reason: "not_eligible", message: `Invoice is ${invoice.status}` };
  }

  const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid ?? 0));
  if (balance < 0.5) return { ok: false, reason: "not_eligible", message: "Nothing left to charge" };

  const { data: biz } = await sb.from("businesses")
    .select("stripe_account_id, stripe_charges_enabled, currency, platform_fee_percent")
    .eq("id", businessId).single();
  if (!biz?.stripe_account_id || !biz.stripe_charges_enabled) {
    return { ok: false, reason: "not_eligible", message: "Card payments aren't enabled for this business" };
  }

  const { data: customer } = await sb.from("customers")
    .select("stripe_customer_id, stripe_payment_method_id, autopay_enabled, allowed_payment_methods")
    .eq("id", invoice.customer_id).maybeSingle();
  if (!customer?.stripe_customer_id || !customer?.stripe_payment_method_id) {
    return { ok: false, reason: "not_eligible", message: "Customer has no saved card" };
  }
  if (!customerAllowsCard(customer.allowed_payment_methods)) {
    return { ok: false, reason: "not_eligible", message: "Card payment is disabled for this customer" };
  }

  const currency = (biz.currency || "GBP").toLowerCase();
  const amountUnit = toStripeAmount(balance, currency);
  const appFee = computeApplicationFeeAmount(
    balance, currency, biz.platform_fee_percent != null ? Number(biz.platform_fee_percent) : null,
  );

  const stripe = getStripe();
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: amountUnit,
        currency,
        customer: customer.stripe_customer_id,
        payment_method: customer.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        application_fee_amount: appFee > 0 ? appFee : undefined,
        metadata: {
          kirei_invoice_id: invoice.id,
          kirei_business_id: businessId,
          kirei_source: "autopay",
        },
      },
      { stripeAccount: biz.stripe_account_id },
    );

    if (pi.status === "succeeded") {
      // Record inline so the invoice flips to paid + receipt sends immediately,
      // independent of webhook delivery. Idempotent if the webhook also fires.
      await recordStripePayment(sb, stripe, {
        businessId,
        invoiceId: invoice.id,
        piId: pi.id,
        amount: balance,
        currency: currency.toUpperCase(),
        connectedAcct: biz.stripe_account_id,
        portalToken: null,
      });
      return { ok: true, paymentIntentId: pi.id, amount: balance };
    }
    // requires_action / processing — couldn't complete unattended.
    return { ok: false, reason: "requires_action", message: `Payment ${pi.status}` };
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    const code = e?.code ?? e?.raw?.code;
    if (code === "authentication_required") {
      return { ok: false, reason: "requires_action", message: "Card needs authentication" };
    }
    if (e?.type === "StripeCardError" || code === "card_declined") {
      return { ok: false, reason: "card_declined", message: e?.message ?? "Card was declined" };
    }
    return { ok: false, reason: "error", message: e?.message ?? "Charge failed" };
  }
}
