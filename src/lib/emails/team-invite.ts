import { emailBase, btn } from "./base";
import {
  renderTemplateVars,
  resolveEmailTemplate,
  type ResolvedEmailTemplate,
} from "./templates";

export function teamInviteEmailVars({
  businessName,
  inviterName,
  role,
  inviteCode,
}: {
  businessName: string;
  inviterName: string;
  role: string;
  inviteCode?: string;
}): Record<string, string> {
  return {
    business_name: businessName,
    inviter_name: inviterName,
    role: role.charAt(0).toUpperCase() + role.slice(1),
    invite_code: inviteCode ?? "",
  };
}

export function teamInviteEmailSubject(
  args: { businessName: string; inviterName: string; role: string; inviteCode?: string },
  template?: ResolvedEmailTemplate,
): string {
  const t = template ?? resolveEmailTemplate("team_invite", null);
  return renderTemplateVars(t.subject, teamInviteEmailVars(args));
}

export function teamInviteEmailHtml({
  businessName,
  inviterName,
  role,
  inviteUrl,
  inviteCode,
  template,
}: {
  businessName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
  /** Short human-typeable invite code for the Connected Hub mobile signup. */
  inviteCode?: string;
  /** Per-business template override; defaults when omitted. */
  template?: ResolvedEmailTemplate;
}): string {
  const isWorker  = role === "worker";

  const t = template ?? resolveEmailTemplate("team_invite", null);
  const vars = teamInviteEmailVars({ businessName, inviterName, role, inviteCode });
  const subjectLine = renderTemplateVars(t.subject, vars);

  if (t.custom_html) {
    return emailBase(subjectLine, renderTemplateVars(t.custom_html, vars), t.accent_color);
  }

  const body = `
    ${t.greeting ? `<p style="margin:0 0 4px;font-size:14px;color:#71717a;">${renderTemplateVars(t.greeting, vars)}</p>` : ""}
    <p style="margin:0 0 16px;font-size:14px;color:#71717a;">
      ${renderTemplateVars(t.intro, vars)}
    </p>
    ${isWorker && inviteCode ? `
    <!-- Worker code (Connected Hub mobile) -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#e7f1f0;border:1px solid #b6d6d3;border-radius:10px;padding:18px;margin:0 0 24px;">
      <tr><td>
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#1f4f4a;font-weight:700;">
          Mobile invite code
        </p>
        <p style="margin:0 0 8px;font-family:'SF Mono','Menlo',monospace;font-size:24px;font-weight:700;color:#1f4f4a;letter-spacing:0.18em;">
          ${inviteCode}
        </p>
        <p style="margin:0;font-size:12px;color:#1f4f4a;">
          Open <strong>Connected Hub</strong> on your phone, tap <em>"Got an invite code?"</em>, enter your email, this code, and a password.
        </p>
      </td></tr>
    </table>
    <p style="margin:0 0 12px;font-size:13px;color:#71717a;">Or use the web app:</p>
    ` : ""}
    <p style="margin:0 0 32px;">${btn(isWorker ? "Sign up on the web" : "Accept invitation", inviteUrl, t.accent_color)}</p>
    <p style="margin:0;font-size:12px;color:#a1a1aa;">
      Or copy this link into your browser:<br/>
      <span style="color:${t.accent_color};word-break:break-all;">${inviteUrl}</span>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">
      If you already have a Kirei account, the link will sign you in and grant access automatically.
    </p>
    ${t.footer_note ? `<p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">${renderTemplateVars(t.footer_note, vars)}</p>` : ""}
  `;

  return emailBase(subjectLine, body, t.accent_color);
}
