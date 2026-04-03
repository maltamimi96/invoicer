/** Shared wrapper so all emails look consistent. */
export function emailBase(title: string, body: string, accentColor = "#3b82f6"): string {
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
        <tr><td style="background:${accentColor};padding:24px 32px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${title}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:12px;color:#71717a;">Sent via Invoicer · Please do not reply to this email.</p>
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
