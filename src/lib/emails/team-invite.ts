import { emailBase, btn } from "./base";

export function teamInviteEmailHtml({
  businessName,
  inviterName,
  role,
  inviteUrl,
}: {
  businessName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}): string {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#71717a;">
      <strong style="color:#18181b;">${inviterName}</strong> has invited you to join
      <strong style="color:#18181b;">${businessName}</strong> on Invoicer as an <strong style="color:#18181b;">${roleLabel}</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#71717a;">
      Click the button below to create your account and get started.
    </p>
    <p style="margin:0 0 32px;">${btn("Accept invitation", inviteUrl)}</p>
    <p style="margin:0;font-size:12px;color:#a1a1aa;">
      Or copy this link into your browser:<br/>
      <span style="color:#3b82f6;word-break:break-all;">${inviteUrl}</span>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">
      If you already have an Invoicer account, the link will sign you in and grant access automatically.
    </p>
  `;

  return emailBase(`You've been invited to ${businessName}`, body);
}
