import { emailBase, lineItemsTable } from "./base";
import {
  renderTemplateVars,
  resolveEmailTemplate,
  type ResolvedEmailTemplate,
} from "./templates";
import type { Business, Customer, LineItem, Quote } from "@/types/database";

/** Variables available to the quote template + subject line. */
export function quoteEmailVars({
  quote,
  customer,
  business,
}: {
  quote: Quote;
  customer: Customer | null;
  business: Business;
}): Record<string, string> {
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
    return Number.isFinite(n) ? n : 0;
  };
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: business.currency }).format(n);
  const date = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return {
    customer_name: customer?.name ?? "there",
    business_name: business.name,
    quote_number: quote.number,
    total: fmt(num(quote.total)),
    issue_date: date(quote.issue_date),
    expiry_date: date(quote.expiry_date),
    property_address: quote.property_address ?? "",
    business_email: business.email ?? "",
    business_phone: business.phone ?? "",
  };
}

export function quoteEmailSubject(
  args: { quote: Quote; customer: Customer | null; business: Business },
  template?: ResolvedEmailTemplate,
): string {
  const t = template ?? resolveEmailTemplate("quote", null);
  return renderTemplateVars(t.subject, quoteEmailVars(args));
}

export function quoteEmailHtml({
  quote,
  customer,
  business,
  lineItems,
  acceptUrl,
  pdfUrl,
  template,
}: {
  quote: Quote;
  customer: Customer | null;
  business: Business;
  lineItems: LineItem[];
  acceptUrl?: string | null;
  /** Direct PDF download link (tokenised). */
  pdfUrl?: string | null;
  /** Per-business template override; defaults when omitted. */
  template?: ResolvedEmailTemplate;
}): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: business.currency }).format(n);

  const issueDate = new Date(quote.issue_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const expiryDate = new Date(quote.expiry_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const t = template ?? resolveEmailTemplate("quote", null);
  const vars = quoteEmailVars({ quote, customer, business });
  const accent = t.accent_color;
  const subjectLine = renderTemplateVars(t.subject, vars);

  // Full custom body override — wrapper + subject still apply.
  if (t.custom_html) {
    return emailBase(subjectLine, renderTemplateVars(t.custom_html, vars), accent);
  }

  const body = `
    ${t.greeting ? `<p style="margin:0 0 4px;font-size:14px;color:#71717a;">${renderTemplateVars(t.greeting, vars)}</p>` : ""}
    ${t.intro ? `<p style="margin:0 0 24px;font-size:14px;color:#71717a;">${renderTemplateVars(t.intro, vars)}</p>` : ""}

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
      ${quote.property_address ? `
      <tr>
        <td style="font-size:13px;color:#71717a;padding-top:8px;">Service address</td>
        <td style="font-size:13px;color:#18181b;text-align:right;padding-top:8px;">${quote.property_address}</td>
      </tr>` : ""}
      <tr>
        <td style="font-size:15px;font-weight:700;color:#18181b;padding-top:16px;border-top:1px solid #e4e4e7;">Quote total</td>
        <td style="font-size:18px;font-weight:700;color:${accent};text-align:right;padding-top:16px;border-top:1px solid #e4e4e7;">${fmt(quote.total)}</td>
      </tr>
    </table>

    ${t.show_line_items ? lineItemsTable(lineItems, business.currency, quote.subtotal, quote.discount_amount, quote.tax_total, quote.total) : ""}

    ${quote.notes ? `<p style="margin:24px 0 0;font-size:13px;color:#71717a;"><strong>Notes:</strong> ${quote.notes}</p>` : ""}
    ${quote.terms ? `<p style="margin:8px 0 0;font-size:13px;color:#71717a;"><strong>Terms:</strong> ${quote.terms}</p>` : ""}

    ${t.show_buttons && (acceptUrl || pdfUrl) ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 0;">
      <tr>
        <td align="center">
          ${acceptUrl ? `<a href="${acceptUrl}" style="display:inline-block;background:${accent};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:8px;margin:0 4px 8px;">Review &amp; accept</a>` : ""}
          ${pdfUrl ? `<a href="${pdfUrl}" style="display:inline-block;background:#ffffff;color:${accent};font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:8px;border:1px solid ${accent};margin:0 4px 8px;">Download PDF</a>` : ""}
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:8px;font-size:12px;color:#a1a1aa;">
          The PDF is also attached to this email.
        </td>
      </tr>
    </table>
    ` : ""}

    ${t.footer_note ? `<p style="margin:24px 0 0;font-size:13px;color:#71717a;">${renderTemplateVars(t.footer_note, vars)}</p>` : ""}
    <p style="margin:24px 0 0;font-size:13px;color:#71717a;">Questions? Contact us at ${business.email ?? business.phone ?? "—"}</p>
  `;

  return emailBase(subjectLine, body, accent);
}
