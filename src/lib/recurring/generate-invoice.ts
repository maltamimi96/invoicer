/**
 * Generate an invoice from a recurring schedule (admin/cron context) and either
 * auto-charge the customer's saved card or email it with a pay link. Used by
 * both the recurring-invoices cron and the auto-bill path of the recurring-jobs
 * cron. Invoice numbers are minted MANUALLY (the next_invoice_number RPC checks
 * auth.uid(), which is null for the service-role client).
 */

import { randomBytes } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { dispatchWebhook } from "@/lib/webhooks";
import { chargeInvoiceToSavedCard } from "@/lib/stripe-charge";
import { customerAllowsCard } from "@/lib/payment-methods";
import type { LineItem } from "@/types/database";

export interface GenerateInvoiceOpts {
  businessId: string;
  userId: string;
  customerId: string;
  lineItems: LineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  dueDays: number;
  notes?: string | null;
  terms?: string | null;
  autoCharge: boolean;
  sendEmail: boolean;
  workOrderId?: string | null;
}

export interface GenerateInvoiceResult {
  invoiceId: string;
  number: string;
  charged: boolean;
  emailed: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateRecurringInvoice(sb: any, opts: GenerateInvoiceOpts): Promise<GenerateInvoiceResult> {
  // Mint the invoice number manually (read-bump the business counter).
  const { data: biz } = await sb.from("businesses")
    .select("invoice_prefix, invoice_next_number, name, email, phone, currency, stripe_charges_enabled, bank_name, bank_account_name, bank_account_number, bank_sort_code, bank_iban")
    .eq("id", opts.businessId).single();
  const next = biz?.invoice_next_number ?? 1;
  await sb.from("businesses").update({ invoice_next_number: next + 1 }).eq("id", opts.businessId);
  const number = `${biz?.invoice_prefix ?? "INV"}-${String(next).padStart(4, "0")}`;

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + (opts.dueDays ?? 14) * 86_400_000).toISOString().slice(0, 10);

  const { data: invoice, error } = await sb.from("invoices").insert({
    business_id: opts.businessId,
    user_id: opts.userId,
    number,
    status: "sent",
    customer_id: opts.customerId,
    issue_date: today,
    due_date: due,
    line_items: opts.lineItems,
    subtotal: opts.subtotal,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_total: opts.taxTotal,
    total: opts.total,
    amount_paid: 0,
    notes: opts.notes ?? null,
    terms: opts.terms ?? null,
    work_order_id: opts.workOrderId ?? null,
  }).select("id, number").single();
  if (error || !invoice) throw error ?? new Error("Recurring invoice insert failed");

  try { dispatchWebhook(opts.businessId, "invoice.created", { id: invoice.id, number, recurring: true }); } catch { /* never blocks */ }

  let charged = false;
  if (opts.autoCharge && biz?.stripe_charges_enabled) {
    const res = await chargeInvoiceToSavedCard(sb, invoice.id, opts.businessId);
    charged = res.ok;
  }

  let emailed = false;
  if (!charged && opts.sendEmail) {
    try {
      emailed = await emailInvoice(sb, opts.businessId, invoice.id, opts.customerId, biz);
    } catch (err) {
      console.warn("[recurring] invoice email failed", err);
    }
  }

  return { invoiceId: invoice.id, number, charged, emailed };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function emailInvoice(sb: any, businessId: string, invoiceId: string, customerId: string, biz: any): Promise<boolean> {
  const { data: customer } = await sb.from("customers")
    .select("name, email, allowed_payment_methods").eq("id", customerId).maybeSingle();
  if (!customer?.email) return false;

  const { data: invoice } = await sb.from("invoices").select("*").eq("id", invoiceId).single();
  if (!invoice) return false;

  const token = await getOrMintToken(sb, businessId, customerId);
  const base = appUrl();
  const portalUrl = base && token ? `${base}/portal/${token}/invoice/${invoiceId}` : null;
  const pdfUrl = base && token ? `${base}/api/pdf/invoice/${invoiceId}?token=${token}` : null;
  const balance = Number(invoice.total) - Number(invoice.amount_paid ?? 0);
  const payUrl = base && token && biz?.stripe_charges_enabled && balance > 0.01 && customerAllowsCard(customer.allowed_payment_methods)
    ? `${base}/api/stripe/checkout?invoice=${invoiceId}&token=${token}`
    : null;

  const { invoiceEmailHtml, invoiceEmailSubject } = await import("@/lib/emails/invoice");
  const { getResolvedEmailTemplate } = await import("@/lib/emails/templates");
  const { sendEmail, buildBusinessFrom } = await import("@/lib/email");

  const tpl = await getResolvedEmailTemplate(sb, businessId, "invoice");
  const lineItems = (invoice.line_items ?? []) as LineItem[];

  await sendEmail({
    to: customer.email,
    subject: invoiceEmailSubject({ invoice, customer, business: biz }, tpl),
    html: invoiceEmailHtml({ invoice, customer, business: biz, lineItems, portalUrl, pdfUrl, payUrl, template: tpl }),
    from: biz?.name ? buildBusinessFrom({ name: biz.name, localPart: "invoices" }) : undefined,
    replyTo: biz?.email || undefined,
    tags: { business_id: businessId, doc_type: "invoice", doc_id: invoiceId },
  });
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrMintToken(sb: any, businessId: string, customerId: string): Promise<string | null> {
  const { data: existing } = await sb.from("customer_portal_tokens")
    .select("token").eq("business_id", businessId).eq("customer_id", customerId)
    .is("revoked_at", null)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .limit(1).maybeSingle();
  if (existing?.token) return existing.token;
  const token = "cust_" + randomBytes(24).toString("hex");
  const { error } = await sb.from("customer_portal_tokens").insert({
    token, business_id: businessId, customer_id: customerId,
    expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  });
  return error ? null : token;
}
