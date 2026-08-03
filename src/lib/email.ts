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

/** Root domain we send from. Override with KIREI_EMAIL_DOMAIN if you ever
 *  migrate. Verified once in Resend; wildcard subdomains (*.kireihq.com)
 *  are also covered if you add the DKIM/SPF records for them. */
const ROOT_DOMAIN = process.env.KIREI_EMAIL_DOMAIN ?? "kireihq.com";

/** Default catch-all FROM when no business is associated with the send
 *  (system / dev-sandbox path). */
const FALLBACK_FROM = process.env.RESEND_FROM_EMAIL ?? "Kirei <onboarding@resend.dev>";

/** Sanitize a business name into a usable local-part / subdomain label.
 *  Strips everything that isn't a-z0-9, collapses repeats, trims length. */
export function slugifyBusiness(name: string): string {
  const slug = (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")  // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 40);
  return slug || "business";
}

/** Build a per-business FROM header, e.g.
 *    "Crown Roofers <invoices@crownroofers.kireihq.com>"
 *
 *  Strategy is controlled by KIREI_FROM_STRATEGY env var:
 *    - "subdomain" (default): invoices@<slug>.kireihq.com
 *        Requires the wildcard `*.kireihq.com` to be verified in Resend.
 *        Cleanest look for the customer.
 *    - "local":             <slug>@kireihq.com
 *        Only needs the root domain verified. Use this if subdomain
 *        wildcard isn't set up yet.
 *
 *  Display name is the business name verbatim (sanitised — no quotes or
 *  pipes — so it can't break the header).
 */
export function buildBusinessFrom(opts: {
  /** Business name shown to the recipient. */
  name: string;
  /** Optional business slug if you already have one stored. Falls back to
   *  slugifying the name. */
  slug?: string | null;
  /** Choose the local-part for the address. Default "invoices" reads
   *  well across invoice / quote / team-invite contexts. */
  localPart?: string;
}): string {
  const strategy = (process.env.KIREI_FROM_STRATEGY ?? "subdomain").toLowerCase();
  const slug = (opts.slug && opts.slug.trim()) || slugifyBusiness(opts.name);
  const local = opts.localPart ?? "invoices";
  const displayName = (opts.name ?? "Kirei")
    .replace(/[<>"\\]/g, "")
    .trim() || "Kirei";

  const address = strategy === "local"
    ? `${slug}@${ROOT_DOMAIN}`
    : `${local}@${slug}.${ROOT_DOMAIN}`;

  return `${displayName} <${address}>`;
}

/** True when the configured FROM address is the dev fallback. In that case
 *  Resend rejects sends to anyone except the API key owner. Surfaced in error
 *  messages so the user knows to verify their domain. */
function isDevFromAddress(from: string): boolean {
  return /onboarding@resend\.dev/i.test(from);
}

export type EmailDocType = "invoice" | "quote" | "team_invite" | "lead" | "payment_receipt" | "outreach" | "custom";

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
  from,
  replyTo,
}: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  /** Optional metadata so we can log this send to email_events and tie webhook
   *  events back to the right invoice/quote. Falls back to a 'custom' row when
   *  business_id is provided without a doc. */
  tags?: EmailTags;
  /** Override the From address — use `buildBusinessFrom({ name })` to get a
   *  per-business sender (e.g. "Crown Roofers <invoices@crownroofers.kireihq.com>"). */
  from?: string;
  /** Set the Reply-To header — usually the business's own email so customer
   *  replies go directly to them, not to our shared inbox. */
  replyTo?: string | string[];
}) {
  const fromHeader = from ?? FALLBACK_FROM;

  // Resend headers can carry tags for our own webhook handler to read back.
  const headers: Record<string, string> = {};
  if (tags?.business_id) headers["X-Kirei-Business"] = tags.business_id;
  if (tags?.doc_type)    headers["X-Kirei-Doc-Type"] = tags.doc_type;
  if (tags?.doc_id)      headers["X-Kirei-Doc-Id"]   = tags.doc_id;

  let resendId: string | null = null;
  let sendError: string | null = null;
  try {
    const { data, error } = await getResend().emails.send({
      from: fromHeader,
      to,
      subject,
      html,
      attachments,
      replyTo: replyTo,
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

  if (sendError) {
    let hint = "";
    if (isDevFromAddress(fromHeader)) {
      hint = " — Sender is still on the resend.dev sandbox, which only delivers to the API-key owner. Verify your domain in Resend.";
    } else if (/domain.*not.*verified/i.test(sendError) || /not_found.*domain/i.test(sendError)) {
      // Subdomain pattern failure — guide the user to the fix.
      hint = ` — The sender (${fromHeader}) isn't a verified Resend domain. ` +
        `Either verify the wildcard *.${ROOT_DOMAIN} in Resend (so each tenant gets its own subdomain), ` +
        `or set KIREI_FROM_STRATEGY=local to send from <slug>@${ROOT_DOMAIN} instead.`;
    }
    throw new Error(sendError + hint);
  }
  return { id: resendId };
}
