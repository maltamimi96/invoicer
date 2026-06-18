import { emailBase, btn } from "./base";
import {
  renderTemplateVars,
  resolveEmailTemplate,
  type ResolvedEmailTemplate,
} from "./templates";

export function workOrderSubmittedEmailVars({
  businessName,
  workerName,
  workerEmail,
  title,
  propertyAddress,
}: {
  businessName: string;
  workerName: string;
  workerEmail: string;
  title: string;
  propertyAddress?: string | null;
}): Record<string, string> {
  return {
    business_name: businessName,
    job_title: title,
    worker_name: workerName,
    worker_email: workerEmail,
    property_address: propertyAddress ?? "",
  };
}

export function workOrderSubmittedEmailSubject(
  args: {
    businessName: string;
    workerName: string;
    workerEmail: string;
    title: string;
    propertyAddress?: string | null;
  },
  template?: ResolvedEmailTemplate,
): string {
  const t = template ?? resolveEmailTemplate("work_order_submitted", null);
  return renderTemplateVars(t.subject, workOrderSubmittedEmailVars(args));
}

export function workOrderSubmittedEmailHtml({
  businessName,
  workerName,
  workerEmail,
  title,
  propertyAddress,
  workerNotes,
  viewUrl,
  template,
}: {
  businessName: string;
  workerName: string;
  workerEmail: string;
  title: string;
  propertyAddress?: string | null;
  workerNotes?: string | null;
  viewUrl: string;
  /** Per-business template override; defaults when omitted. */
  template?: ResolvedEmailTemplate;
}): string {
  const t = template ?? resolveEmailTemplate("work_order_submitted", null);
  const vars = workOrderSubmittedEmailVars({ businessName, workerName, workerEmail, title, propertyAddress });
  const subjectLine = renderTemplateVars(t.subject, vars);

  if (t.custom_html) {
    return emailBase(subjectLine, renderTemplateVars(t.custom_html, vars), t.accent_color);
  }

  const body = `
    ${t.greeting ? `<p style="margin:0 0 4px;font-size:14px;color:#71717a;">${renderTemplateVars(t.greeting, vars)}</p>` : ""}
    <p style="margin:0 0 4px;font-size:14px;color:#71717a;">${renderTemplateVars(t.intro, vars)}</p>

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

    ${t.show_buttons ? `<p style="margin:0 0 24px;">${btn("Review work order", viewUrl, t.accent_color)}</p>` : ""}
    ${t.footer_note ? `<p style="margin:0 0 8px;font-size:12px;color:#a1a1aa;">${renderTemplateVars(t.footer_note, vars)}</p>` : ""}
    <p style="margin:0;font-size:12px;color:#a1a1aa;">
      Sent from <strong>${businessName}</strong> — Kirei
    </p>
  `;

  return emailBase(subjectLine, body, t.accent_color);
}
