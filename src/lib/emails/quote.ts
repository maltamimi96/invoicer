import { emailBase, lineItemsTable } from "./base";
import type { Business, Customer, LineItem, Quote } from "@/types/database";

export function quoteEmailHtml({
  quote,
  customer,
  business,
  lineItems,
  acceptUrl,
}: {
  quote: Quote;
  customer: Customer | null;
  business: Business;
  lineItems: LineItem[];
  acceptUrl?: string | null;
}): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: business.currency }).format(n);

  const issueDate = new Date(quote.issue_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const expiryDate = new Date(quote.expiry_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const body = `
    <p style="margin:0 0 4px;font-size:14px;color:#71717a;">Hi ${customer?.name ?? "there"},</p>
    <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Please find your quote from <strong style="color:#18181b;">${business.name}</strong> below.</p>

    <!-- Quote summary card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="font-size:13px;color:#71717a;">Quote number</td>
        <td style="font-size:14px;font-weight:600;color:#18181b;text-align:right;">${quote.number}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#71717a;padding-top:8px;">Issue date</td>
        <td style="font-size:14px;color:#18181b;text-align:right;padding-top:8px;">${issueDate}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#71717a;padding-top:8px;">Valid until</td>
        <td style="font-size:14px;color:#ef4444;text-align:right;padding-top:8px;">${expiryDate}</td>
      </tr>
      <tr>
        <td style="font-size:15px;font-weight:700;color:#18181b;padding-top:16px;border-top:1px solid #e4e4e7;">Quote total</td>
        <td style="font-size:18px;font-weight:700;color:#8b5cf6;text-align:right;padding-top:16px;border-top:1px solid #e4e4e7;">${fmt(quote.total)}</td>
      </tr>
    </table>

    ${lineItemsTable(lineItems, business.currency, quote.subtotal, quote.discount_amount, quote.tax_total, quote.total)}

    ${quote.notes ? `<p style="margin:24px 0 0;font-size:13px;color:#71717a;"><strong>Notes:</strong> ${quote.notes}</p>` : ""}
    ${quote.terms ? `<p style="margin:8px 0 0;font-size:13px;color:#71717a;"><strong>Terms:</strong> ${quote.terms}</p>` : ""}

    ${acceptUrl ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 0;">
      <tr>
        <td align="center">
          <a href="${acceptUrl}" style="display:inline-block;background:#8b5cf6;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">
            Review &amp; accept quote
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:8px;font-size:12px;color:#a1a1aa;">
          The PDF is also attached to this email.
        </td>
      </tr>
    </table>
    ` : ""}

    <p style="margin:24px 0 0;font-size:13px;color:#71717a;">Questions? Contact us at ${business.email ?? business.phone ?? "—"}</p>
  `;

  return emailBase(`Quote ${quote.number} from ${business.name}`, body, "#8b5cf6");
}
