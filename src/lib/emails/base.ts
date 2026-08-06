/** Public Kirei logo URL — must be absolute because emails render remotely. */
const LOGO_URL =
  (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://kireihq.com") + "/kirei-logo.png";

/** The sending business, for the header. Without this an email goes out
 *  carrying Kirei's brand to someone who has never heard of Kirei. */
export interface EmailBrand {
  name: string;
  logoUrl?: string | null;
}

/** Escape a value going into an HTML attribute or text node. */
function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Header identifying the sender.
 *
 * Falls back to the business NAME when there's no logo — never to Kirei's
 * logo. The customer is dealing with the business, not the platform.
 */
function brandHeader(brand: EmailBrand | undefined, accentColor: string): string {
  if (!brand) return "";
  const inner = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name)}" height="36"
         style="display:block;max-height:36px;max-width:180px;border:0;outline:none;text-decoration:none;" />`
    : `<span style="font-size:17px;font-weight:700;color:${accentColor};letter-spacing:-0.01em;">${esc(brand.name)}</span>`;
  return `<tr><td style="padding:24px 32px 0;">${inner}</td></tr>`;
}

/** Shared wrapper so all emails look consistent. */
export function emailBase(
  title: string, body: string, accentColor = "#3b82f6", brand?: EmailBrand,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        ${brandHeader(brand, accentColor)}
        ${brand
          ? `<tr><td style="padding:12px 32px 0;">
               <p style="margin:0;font-size:20px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">${title}</p>
               <div style="height:3px;width:44px;background:${accentColor};border-radius:2px;margin-top:10px;"></div>
             </td></tr>`
          : `<tr><td style="background:${accentColor};padding:24px 32px;">
               <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${title}</p>
             </td></tr>`}
        <!-- Body -->
        <tr><td style="padding:32px;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #e4e4e7;">
          <table cellpadding="0" cellspacing="0" style="width:100%;">
            <tr>
              <td style="vertical-align:middle;">
                ${brand ? `<p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#3f3f46;">${brand.name}</p>` : ""}
                <img src="${LOGO_URL}" alt="Kirei" width="16" height="16" style="display:inline-block;vertical-align:middle;border-radius:4px;opacity:0.6;" />
                <span style="font-size:11px;color:#a1a1aa;margin-left:6px;vertical-align:middle;">Sent via Kirei · Please do not reply to this email.</span>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function btn(label: string, href: string, color = "#3b82f6"): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 24px;background:${color};color:#ffffff;font-weight:600;font-size:14px;border-radius:8px;text-decoration:none;">${label}</a>`;
}

export function lineItemsTable(
  items: Array<{ description?: string; quantity: number; unit_price: number; total: number }>,
  currency: string,
  subtotal: number,
  discountAmount: number,
  taxTotal: number,
  total: number,
): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);

  const rows = items
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#18181b;border-bottom:1px solid #f4f4f5;">${i.description ?? ""}</td>
        <td style="padding:8px 0;font-size:14px;color:#71717a;text-align:center;border-bottom:1px solid #f4f4f5;">${i.quantity}</td>
        <td style="padding:8px 0;font-size:14px;color:#71717a;text-align:right;border-bottom:1px solid #f4f4f5;">${fmt(i.unit_price)}</td>
        <td style="padding:8px 0;font-size:14px;color:#18181b;font-weight:600;text-align:right;border-bottom:1px solid #f4f4f5;">${fmt(i.total)}</td>
      </tr>`,
    )
    .join("");

  const discountRow =
    discountAmount > 0
      ? `<tr><td colspan="3" style="padding:4px 0;font-size:13px;color:#71717a;text-align:right;">Discount</td><td style="padding:4px 0;font-size:13px;color:#71717a;text-align:right;">-${fmt(discountAmount)}</td></tr>`
      : "";

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
    <thead>
      <tr style="border-bottom:2px solid #e4e4e7;">
        <th style="padding:8px 0;font-size:12px;color:#71717a;font-weight:600;text-align:left;text-transform:uppercase;">Description</th>
        <th style="padding:8px 0;font-size:12px;color:#71717a;font-weight:600;text-align:center;text-transform:uppercase;">Qty</th>
        <th style="padding:8px 0;font-size:12px;color:#71717a;font-weight:600;text-align:right;text-transform:uppercase;">Price</th>
        <th style="padding:8px 0;font-size:12px;color:#71717a;font-weight:600;text-align:right;text-transform:uppercase;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td colspan="3" style="padding:8px 0;font-size:13px;color:#71717a;text-align:right;">Subtotal</td><td style="padding:8px 0;font-size:13px;color:#71717a;text-align:right;">${fmt(subtotal)}</td></tr>
      ${discountRow}
      <tr><td colspan="3" style="padding:4px 0;font-size:13px;color:#71717a;text-align:right;">Tax</td><td style="padding:4px 0;font-size:13px;color:#71717a;text-align:right;">${fmt(taxTotal)}</td></tr>
      <tr><td colspan="3" style="padding:8px 0;font-size:15px;font-weight:700;color:#18181b;text-align:right;border-top:2px solid #e4e4e7;">Total</td><td style="padding:8px 0;font-size:15px;font-weight:700;color:#18181b;text-align:right;border-top:2px solid #e4e4e7;">${fmt(total)}</td></tr>
    </tfoot>
  </table>`;
}
