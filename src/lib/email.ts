import { Resend } from "resend";

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
const FROM = process.env.RESEND_FROM_EMAIL ?? "Invoicer <onboarding@resend.dev>";

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}) {
  const { data, error } = await getResend().emails.send({
    from: FROM,
    to,
    subject,
    html,
    attachments,
  });
  if (error) throw new Error(error.message);
  return data;
}
