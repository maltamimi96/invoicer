import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not configured");
    _resend = new Resend(key);
  }
  return _resend;
}

// Default from address — override with RESEND_FROM_EMAIL env var once you verify a domain.
// During development, Resend allows sending from onboarding@resend.dev to your own email only.
const FROM = process.env.RESEND_FROM_EMAIL ?? "Kirei <onboarding@resend.dev>";

export type EmailDocType = "invoice" | "quote" | "team_invite" | "lead" | "custom";

export interface EmailTags {
  business_id?: string | null;
  doc_type?: EmailDocType;
  doc_id?: string | null;
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
  tags,
}: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  /** Optional metadata so we can log this send to email_events and tie webhook
   *  events back to the right invoice/quote. Falls back to a 'custom' row when
   *  business_id is provided without a doc. */
  tags?: EmailTags;
}) {
  // Resend headers can carry tags for our own webhook handler to read back.
  const headers: Record<string, string> = {};
  if (tags?.business_id) headers["X-Kirei-Business"] = tags.business_id;
  if (tags?.doc_type)    headers["X-Kirei-Doc-Type"] = tags.doc_type;
  if (tags?.doc_id)      headers["X-Kirei-Doc-Id"]   = tags.doc_id;

  let resendId: string | null = null;
  let sendError: string | null = null;
  try {
    const { data, error } = await getResend().emails.send({
      from: FROM,
      to,
      subject,
      html,
      attachments,
      headers: Object.keys(headers).length ? headers : undefined,
    });
    if (error) throw new Error(error.message);
    resendId = data?.id ?? null;
  } catch (e) {
    sendError = e instanceof Error ? e.message : String(e);
  }

  // Best-effort log — never fail the send because logging failed.
  if (tags?.business_id) {
    try {
      const sb = createAdminClient();
      const recipients = Array.isArray(to) ? to : [to];
      const rows = recipients.map((recipient) => ({
        business_id: tags.business_id!,
        resend_id:   resendId,
        doc_type:    tags.doc_type ?? "custom",
        doc_id:      tags.doc_id ?? null,
        recipient,
        subject,
        status:      sendError ? "failed" : "sent",
        error:       sendError,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from("email_events").insert(rows);
    } catch {
      /* logging is non-fatal */
    }
  }

  if (sendError) throw new Error(sendError);
  return { id: resendId };
}
