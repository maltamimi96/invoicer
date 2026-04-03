import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Default from address — override with RESEND_FROM_EMAIL env var once you verify a domain.
// During development, Resend allows sending from onboarding@resend.dev to your own email only.
const FROM = process.env.RESEND_FROM_EMAIL ?? "Invoicer <onboarding@resend.dev>";

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}) {
  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    attachments,
  });
  if (error) throw new Error(error.message);
  return data;
}
