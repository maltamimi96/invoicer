import { emailBase, lineItemsTable } from "./base";
import type { Business, Customer, Invoice, LineItem } from "@/types/database";

export function invoiceEmailHtml({
  invoice,
  customer,
  business,
  lineItems,
  portalUrl,
  pdfUrl,
}: {
  invoice: Invoice;
  customer: Customer | null;
  business: Business;
  lineItems: LineItem[];
  portalUrl?: string | null;
  /** Direct PDF download link (tokenised). Renders a 'Download PDF' button
   *  in the body so the customer can grab the PDF even when their email
   *  client strips attachments. */
  pdfUrl?: string | null;
}): string {
  // Coerce numbers — Postgres returns numeric columns as strings via PostgREST,
  // so plain subtraction was producing NaN in the email Total field.
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
    return Number.isFinite(n) ? n : 0;
  };
  const total       = num(invoice.total);
  const amountPaid  = num(invoice.amount_paid);
  const subtotal    = num(invoice.subtotal);
  const discountAmt = num(invoice.discount_amount);
  const taxTotal    = num(invoice.tax_total);
  const balanceDue  = Math.max(0, total - amountPaid);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: business.currency }).format(num(n));

  const issueDate = new Date(invoice.issue_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const dueDate = new Date(invoice.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const body = `
    <p style="margin:0 0 4px;font-size:14px;color:#71717a;">Hi ${customer?.name ?? "there"},</p>
    <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Please find your invoice from <strong style="color:#18181b;">${business.name}</strong> attached to this email.</p>

    <!-- Invoice summary card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="font-size:13px;color:#71717a;">Invoice number</td>
        <td style="font-size:14px;font-weight:600;color:#18181b;text-align:right;">${invoice.number}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#71717a;padding-top:8px;">Issue date</td>
        <td style="font-size:14px;color:#18181b;text-align:right;padding-top:8px;">${issueDate}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#71717a;padding-top:8px;">Due date</td>
        <td style="font-size:14px;color:#18181b;text-align:right;padding-top:8px;">${dueDate}</td>
      </tr>
      ${invoice.property_address ? `
      <tr>
        <td style="font-size:13px;color:#71717a;padding-top:8px;">Service address</td>
        <td style="font-size:13px;color:#18181b;text-align:right;padding-top:8px;">${invoice.property_address}</td>
      </tr>` : ""}
      <tr>
        <td style="font-size:15px;font-weight:700;color:#18181b;padding-top:16px;border-top:1px solid #e4e4e7;">Amount due</td>
        <td style="font-size:18px;font-weight:700;color:#3b82f6;text-align:right;padding-top:16px;border-top:1px solid #e4e4e7;">${fmt(balanceDue)}</td>
      </tr>
    </table>

    ${portalUrl || pdfUrl ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td align="center">
        ${portalUrl ? `<a href="${portalUrl}" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;margin:0 4px 8px;">View invoice online</a>` : ""}
        ${pdfUrl ? `<a href="${pdfUrl}" style="display:inline-block;background:#ffffff;color:#3b82f6;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;border:1px solid #3b82f6;margin:0 4px 8px;">Download PDF</a>` : ""}
      </td></tr>
    </table>` : ""}

    ${lineItemsTable(lineItems, business.currency, subtotal, discountAmt, taxTotal, total)}

    ${invoice.notes ? `<p style="margin:24px 0 0;font-size:13px;color:#71717a;"><strong>Notes:</strong> ${invoice.notes}</p>` : ""}
    ${invoice.terms ? `<p style="margin:8px 0 0;font-size:13px;color:#71717a;"><strong>Payment terms:</strong> ${invoice.terms}</p>` : ""}

    ${business.bank_name || business.bank_account_number ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:16px;margin-top:24px;">
      <tr><td style="font-size:13px;font-weight:600;color:#15803d;padding-bottom:8px;">Payment details</td></tr>
      ${business.bank_name ? `<tr><td style="font-size:13px;color:#166534;">Bank: ${business.bank_name}</td></tr>` : ""}
      ${business.bank_account_name ? `<tr><td style="font-size:13px;color:#166534;">Account name: ${business.bank_account_name}</td></tr>` : ""}
      ${business.bank_account_number ? `<tr><td style="font-size:13px;color:#166534;">Account number: ${business.bank_account_number}</td></tr>` : ""}
      ${business.bank_sort_code ? `<tr><td style="font-size:13px;color:#166534;">Sort code: ${business.bank_sort_code}</td></tr>` : ""}
      ${business.bank_iban ? `<tr><td style="font-size:13px;color:#166534;">IBAN: ${business.bank_iban}</td></tr>` : ""}
    </table>` : ""}

    <p style="margin:24px 0 0;font-size:13px;color:#71717a;">Questions? Contact us at ${business.email ?? business.phone ?? "—"}</p>
  `;

  return emailBase(`Invoice ${invoice.number} from ${business.name}`, body);
}
