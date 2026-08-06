/**
 * Record a successful Revolut payment against an invoice. Mirrors
 * recordStripePayment (idempotent on (business_id, provider_payment_id), same
 * invoice + parent rollup, same receipt email) but with provider "revolut" and
 * no Stripe-specific fee/application-fee lookup.
 */

import { dispatchWebhook } from "@/lib/webhooks";

interface RecordOpts {
  businessId: string;
  invoiceId: string;
  /** Revolut order id — the idempotency + provider payment id. */
  orderId: string;
  amount: number;
  /** Revolut processing fee, if known (often null until settled). */
  fee?: number | null;
  portalToken?: string | null;
}

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

export async function recordRevolutPayment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  opts: RecordOpts,
): Promise<boolean> {
  const { businessId, invoiceId, orderId } = opts;

  const { data: existing } = await sb.from("payments")
    .select("id").eq("business_id", businessId).eq("provider_payment_id", orderId).maybeSingle();
  if (existing) return false;

  const { data: invoice } = await sb.from("invoices")
    .select("id, total, amount_paid, parent_invoice_id, user_id, status, number, customer_id")
    .eq("id", invoiceId).eq("business_id", businessId).single();
  if (!invoice) {
    console.warn("[revolut] invoice not found for payment", invoiceId);
    return false;
  }

  const { error: insErr } = await sb.from("payments").insert({
    invoice_id: invoiceId,
    business_id: businessId,
    user_id: invoice.user_id,
    amount: opts.amount,
    date: new Date().toISOString().slice(0, 10),
    method: "Revolut",
    reference: orderId,
    notes: null,
    provider: "revolut",
    provider_payment_id: orderId,
    provider_session_id: null,
    provider_fee: opts.fee ?? null,
    provider_platform_fee: null,
  });
  if (insErr) {
    if (insErr.code === "23505") return false; // concurrent insert — already recorded
    throw insErr;
  }

  await recomputeInvoice(sb, businessId, invoiceId, invoice.total);
  if (invoice.parent_invoice_id) await recomputeParent(sb, businessId, invoice.parent_invoice_id);
  await revalidateInvoiceViews(invoiceId);

  try {
    dispatchWebhook(businessId, "payment.received", {
      invoice_id: invoiceId, amount: opts.amount, provider: "revolut", revolut_order_id: orderId,
    });
  } catch { /* never blocks */ }

  try {
    await sendPaymentReceipt(sb, { businessId, invoiceId, amount: opts.amount, portalToken: opts.portalToken ?? null });
  } catch (err) {
    console.warn("[revolut] receipt email failed", err);
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
    paymentMethod: "Revolut",
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
