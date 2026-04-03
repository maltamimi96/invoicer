import { emailBase, lineItemsTable } from "./base";
import type { Business, Customer, Invoice, LineItem } from "@/types/database";

export function invoiceEmailHtml({
  invoice,
  customer,
  business,
  lineItems,
}: {
  invoice: Invoice;
  customer: Customer | null;
  business: Business;
  lineItems: LineItem[];
}): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: business.currency }).format(n);

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
      <tr>
        <td style="font-size:15px;font-weight:700;color:#18181b;padding-top:16px;border-top:1px solid #e4e4e7;">Amount due</td>
        <td style="font-size:18px;font-weight:700;color:#3b82f6;text-align:right;padding-top:16px;border-top:1px solid #e4e4e7;">${fmt(invoice.total - invoice.amount_paid)}</td>
      </tr>
    </table>

    ${lineItemsTable(lineItems, business.currency, invoice.subtotal, invoice.discount_amount, invoice.tax_total, invoice.total)}

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
