/**
 * Branded booking emails — from the business, with its logo + colour, and full
 * appointment context. Email-client-safe (tables + inline styles).
 */
const KIREI_LOGO =
  (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://kireihq.com") + "/kirei-logo.png";

export type BookingEmailKind = "confirmed" | "reminder" | "cancelled";

export interface BookingEmailOpts {
  kind: BookingEmailKind;
  businessName: string;
  logoUrl: string | null;
  accent: string;            // business primary colour, e.g. "#1f8f86"
  customerName: string;
  serviceName: string | null;
  whenText: string;          // pre-formatted in the business timezone
  durationMin: number | null;
  resourceName: string | null;
  address: string | null;
  notes: string | null;
  manageUrl: string | null;  // omitted for cancelled
  businessEmail: string | null;
  businessPhone: string | null;
  customMessage: string | null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function shade(hex: string, pct: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const adj = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * pct)));
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return `#${[adj(r), adj(g), adj(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const COPY: Record<BookingEmailKind, { badge: string; heading: (b: string) => string; intro: (n: string, b: string) => string }> = {
  confirmed: {
    badge: "Confirmed",
    heading: () => "Your booking is confirmed",
    intro: (n, b) => `Thanks ${esc(n)}, your appointment with <strong>${esc(b)}</strong> is locked in. Here are the details:`,
  },
  reminder: {
    badge: "Reminder",
    heading: () => "Appointment reminder",
    intro: (n, b) => `Hi ${esc(n)}, this is a friendly reminder of your upcoming appointment with <strong>${esc(b)}</strong>:`,
  },
  cancelled: {
    badge: "Cancelled",
    heading: () => "Booking cancelled",
    intro: (n, b) => `Hi ${esc(n)}, your appointment with <strong>${esc(b)}</strong> has been cancelled. The details are below for your records.`,
  },
};

export function bookingEmailHtml(o: BookingEmailOpts): string {
  const accent = /^#?[a-f\d]{6}$/i.test(o.accent) ? (o.accent.startsWith("#") ? o.accent : `#${o.accent}`) : "#1f8f86";
  const accentDark = shade(accent, -0.22);
  const c = COPY[o.kind];
  const title = c.heading(o.businessName);

  const logoBlock = o.logoUrl
    ? `<img src="${o.logoUrl}" alt="${esc(o.businessName)}" width="48" height="48" style="display:block;border-radius:12px;background:#ffffff;object-fit:cover;" />`
    : `<div style="width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.2);border:2px solid rgba(255,255,255,0.4);color:#ffffff;font-size:20px;font-weight:800;text-align:center;line-height:48px;">${esc(o.businessName.slice(0, 2).toUpperCase())}</div>`;

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;font-size:13px;color:#71717a;width:120px;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;font-size:14px;color:#18181b;font-weight:600;text-align:right;vertical-align:top;">${value}</td>
    </tr>`;

  const detailRows = [
    o.serviceName ? row("Service", esc(o.serviceName)) : "",
    row("When", esc(o.whenText)),
    o.durationMin ? row("Duration", `${o.durationMin} min`) : "",
    o.resourceName ? row("With", esc(o.resourceName)) : "",
    o.address ? row("Location", esc(o.address)) : "",
    o.notes ? row("Your notes", esc(o.notes)) : "",
  ].join("");

  const strike = o.kind === "cancelled";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#eef0f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.08);">
        <!-- Branded header -->
        <tr><td style="background:linear-gradient(135deg,${accent},${accentDark});padding:28px 32px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">${logoBlock}</td>
            <td style="vertical-align:middle;padding-left:14px;">
              <div style="font-size:18px;font-weight:800;color:#ffffff;">${esc(o.businessName)}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.85);margin-top:2px;">${c.badge}</div>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:22px;color:#18181b;">${esc(title)}</h1>
          <p style="margin:0 0 22px;font-size:14px;color:#52525b;line-height:1.55;">${c.intro(o.customerName, o.businessName)}</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #eceef1;border-radius:12px;padding:8px 18px;${strike ? "opacity:0.7;" : ""}">
            ${detailRows}
          </table>

          ${o.customMessage ? `<p style="margin:22px 0 0;font-size:14px;color:#52525b;line-height:1.55;">${esc(o.customMessage)}</p>` : ""}

          ${o.manageUrl && o.kind !== "cancelled" ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px;"><tr><td align="center">
            <a href="${o.manageUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 28px;border-radius:10px;">Manage or reschedule</a>
          </td></tr></table>
          <p style="margin:14px 0 0;font-size:12px;color:#a1a1aa;text-align:center;">Need to cancel? Use the button above.</p>` : ""}

          <p style="margin:26px 0 0;font-size:13px;color:#71717a;">
            Questions? Contact ${esc(o.businessName)}${o.businessEmail ? ` at <a href="mailto:${o.businessEmail}" style="color:${accent};">${o.businessEmail}</a>` : ""}${o.businessPhone ? `${o.businessEmail ? " or " : " on "}${esc(o.businessPhone)}` : ""}.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #eceef1;">
          <img src="${KIREI_LOGO}" alt="Kirei" width="16" height="16" style="display:inline-block;vertical-align:middle;border-radius:3px;" />
          <span style="font-size:12px;color:#a1a1aa;margin-left:6px;vertical-align:middle;">Booked with ${esc(o.businessName)} · powered by Kirei</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
