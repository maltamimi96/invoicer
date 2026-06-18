import { emailBase } from "./base";
import {
  renderTemplateVars,
  resolveEmailTemplate,
  type ResolvedEmailTemplate,
} from "./templates";
import type { Business, Customer, Invoice } from "@/types/database";

/** Variables available to the payment-receipt template + subject line. */
export function paymentReceiptEmailVars({
  invoice,
  customer,
  business,
  amount,
  paymentDate,
  paymentMethod,
}: {
  invoice: Invoice;
  customer: Customer | null;
  business: Business;
  /** The amount of THIS payment (not the running total). */
  amount: number;
  paymentDate: string;
  paymentMethod?: string | null;
}): Record<string, string> {
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
    return Number.isFinite(n) ? n : 0;
  };
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: business.currency }).format(n);
  const date = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const balance = Math.max(0, num(invoice.total) - num(invoice.amount_paid));
  return {
    customer_name: customer?.name ?? "there",
    business_name: business.name,
    invoice_number: invoice.number,
    amount: fmt(num(amount)),
    amount_paid: fmt(num(invoice.amount_paid)),
    balance_due: fmt(balance),
    total: fmt(num(invoice.total)),
    payment_date: date(paymentDate),
    payment_method: paymentMethod ?? "Card",
    business_email: business.email ?? "",
    business_phone: business.phone ?? "",
  };
}

export function paymentReceiptEmailSubject(
  args: Parameters<typeof paymentReceiptEmailVars>[0],
  template?: ResolvedEmailTemplate,
): string {
  const t = template ?? resolveEmailTemplate("payment_receipt", null);
  return renderTemplateVars(t.subject, paymentReceiptEmailVars(args));
}

export function paymentReceiptEmailHtml({
  invoice,
  customer,
  business,
  amount,
  paymentDate,
  paymentMethod,
  portalUrl,
  template,
}: {
  invoice: Invoice;
  customer: Customer | null;
  business: Business;
  amount: number;
  paymentDate: string;
  paymentMethod?: string | null;
  portalUrl?: string | null;
  template?: ResolvedEmailTemplate;
}): string {
  const t = template ?? resolveEmailTemplate("payment_receipt", null);
  const vars = paymentReceiptEmailVars({ invoice, customer, business, amount, paymentDate, paymentMethod });
  const accent = t.accent_color;
  const subjectLine = renderTemplateVars(t.subject, vars);

  if (t.custom_html) {
    return emailBase(subjectLine, renderTemplateVars(t.custom_html, vars), accent);
  }

  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
    return Number.isFinite(n) ? n : 0;
  };
  const balance = Math.max(0, num(invoice.total) - num(invoice.amount_paid));
  const fullyPaid = balance < 0.01;

  const body = `
    ${t.greeting ? `<p style="margin:0 0 4px;font-size:14px;color:#71717a;">${renderTemplateVars(t.greeting, vars)}</p>` : ""}
    ${t.intro ? `<p style="margin:0 0 24px;font-size:14px;color:#71717a;">${renderTemplateVars(t.intro, vars)}</p>` : ""}

    <!-- Receipt card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="font-size:13px;color:#15803d;">Amount paid</td>
        <td style="font-size:20px;font-weight:700;color:#15803d;text-align:right;">${vars.amount}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#166534;padding-top:8px;">Invoice</td>
        <td style="font-size:14px;color:#166534;text-align:right;padding-top:8px;">${invoice.number}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#166534;padding-top:8px;">Date</td>
        <td style="font-size:14px;color:#166534;text-align:right;padding-top:8px;">${vars.payment_date}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#166534;padding-top:8px;">Method</td>
        <td style="font-size:14px;color:#166534;text-align:right;padding-top:8px;">${vars.payment_method}</td>
      </tr>
      <tr>
        <td style="font-size:14px;font-weight:600;color:#166534;padding-top:12px;border-top:1px solid #bbf7d0;">${fullyPaid ? "Status" : "Balance remaining"}</td>
        <td style="font-size:14px;font-weight:700;color:#166534;text-align:right;padding-top:12px;border-top:1px solid #bbf7d0;">${fullyPaid ? "Paid in full ✓" : vars.balance_due}</td>
      </tr>
    </table>

    ${t.show_buttons && portalUrl ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td align="center">
        <a href="${portalUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View invoice</a>
      </td></tr>
    </table>` : ""}

    ${t.footer_note ? `<p style="margin:24px 0 0;font-size:13px;color:#71717a;">${renderTemplateVars(t.footer_note, vars)}</p>` : ""}
    <p style="margin:24px 0 0;font-size:13px;color:#71717a;">Questions? Contact us at ${business.email ?? business.phone ?? "—"}</p>
  `;

  return emailBase(subjectLine, body, accent);
}
