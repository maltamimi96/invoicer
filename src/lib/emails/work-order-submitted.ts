import { emailBase, btn } from "./base";

export function workOrderSubmittedEmailHtml({
  businessName,
  workerName,
  workerEmail,
  title,
  propertyAddress,
  workerNotes,
  viewUrl,
}: {
  businessName: string;
  workerName: string;
  workerEmail: string;
  title: string;
  propertyAddress?: string | null;
  workerNotes?: string | null;
  viewUrl: string;
}): string {
  const body = `
    <p style="margin:0 0 4px;font-size:14px;color:#71717a;">A work order has been submitted and is ready for review.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:20px;margin:24px 0;">
      <tr>
        <td style="font-size:13px;color:#71717a;">Job</td>
        <td style="font-size:14px;font-weight:600;color:#18181b;text-align:right;">${title}</td>
      </tr>
      ${propertyAddress ? `
      <tr>
        <td style="font-size:13px;color:#71717a;padding-top:8px;">Location</td>
        <td style="font-size:14px;color:#18181b;text-align:right;padding-top:8px;">${propertyAddress}</td>
      </tr>` : ""}
      <tr>
        <td style="font-size:13px;color:#71717a;padding-top:8px;">Submitted by</td>
        <td style="font-size:14px;color:#18181b;text-align:right;padding-top:8px;">${workerName} (${workerEmail})</td>
      </tr>
    </table>

    ${workerNotes ? `
    <div style="background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#92400e;text-transform:uppercase;">Worker notes</p>
      <p style="margin:0;font-size:14px;color:#78350f;">${workerNotes}</p>
    </div>` : ""}

    <p style="margin:0 0 24px;">${btn("Review work order", viewUrl, "#10b981")}</p>
    <p style="margin:0;font-size:12px;color:#a1a1aa;">
      Sent from <strong>${businessName}</strong> — Invoicer
    </p>
  `;

  return emailBase("Work order submitted", body, "#10b981");
}
