/**
 * Sending an onboarding form — the session-free layer.
 *
 * `sendOnboardingRequest` resolves the business from `getUser()`, so a cron or
 * an automation can't send a form: there's no session. Same shape as
 * `lib/sms.ts`, and the same reason.
 *
 * Plain module — no "use server". Import from actions, routes and crons.
 */
import { randomBytes } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { secureFieldsAvailable } from "./crypto";
import { ensureContactForLead } from "@/lib/leads/promote";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Sb, name: string) => sb.from(name);

export type SendOnboardingResult =
  | { ok: true; request_id: string; url: string }
  | { ok: false; error: string };

/**
 * Is this an address a mail provider will actually accept?
 *
 * Deliberately stricter than the EMAIL_RE in ./validate.ts, which is
 * `[^\s@]+@[^\s@]+\.[^\s@]{2,}` — that permits a comma anywhere, so
 * `info@crownroofers.com,au` (a comma typed for the second dot, the exact
 * failure this guard was written for) sails through it while Resend rejects it.
 *
 * Here the domain must be dot-separated labels of letters, digits and hyphens,
 * ending in an alphabetic TLD, so a stray comma or space can't hide in it.
 */
function looksLikeEmail(v: string): boolean {
  return /^[^\s@,;]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(v.trim());
}

/** Reuse a live portal token for this customer, or mint one. */
export async function mintPortalTokenFor(
  sb: Sb, businessId: string, customerId: string, createdBy: string | null,
): Promise<string> {
  const { data: existing } = await tbl(sb, "customer_portal_tokens")
    .select("token").eq("business_id", businessId).eq("customer_id", customerId)
    .is("revoked_at", null)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing?.token) return existing.token as string;

  const token = "cust_" + randomBytes(24).toString("hex");
  const { error } = await tbl(sb, "customer_portal_tokens").insert({
    token, business_id: businessId, customer_id: customerId, created_by: createdBy,
    expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  });
  if (error) throw error;
  return token;
}

/**
 * Create (or reuse) an onboarding request and optionally email the link.
 *
 * Expected failures are RETURNED, not thrown — Next masks thrown server-action
 * messages in production, and an automation needs a reason it can record.
 */
export async function sendOnboardingFormFor(
  sb: Sb,
  businessId: string,
  formId: string,
  customerId: string,
  opts: { email?: boolean; createdBy?: string | null } = {},
): Promise<SendOnboardingResult> {
  const [{ data: form }, { data: customer }, { data: biz, error: bizErr }] = await Promise.all([
    tbl(sb, "onboarding_forms").select("id, name, status, schema").eq("id", formId).eq("business_id", businessId).maybeSingle(),
    tbl(sb, "customers").select("id, name, email").eq("id", customerId).eq("business_id", businessId).maybeSingle(),
    // NOT `slug` — businesses has no such column, only audit_slug. Asking for it
    // made PostgREST reject the whole select, and because only `data` was
    // destructured the error went unread: biz came back null and every one of
    // these emails went out as "Your provider" from the fallback sender.
    // buildBusinessFrom slugifies the name when no slug is given, which is what
    // we want anyway.
    tbl(sb, "businesses").select("name, email").eq("id", businessId).single(),
  ]);
  if (bizErr) console.error("[onboarding/send] business lookup failed:", bizErr.message);

  if (!form) return { ok: false, error: "Form not found" };
  if (!customer) return { ok: false, error: "Customer not found" };
  if ((form.schema ?? []).length === 0) {
    return { ok: false, error: "Add at least one field before sending" };
  }

  // A form with a secure field can't be submitted while the encryption key is
  // missing — the customer would fill it in, hit save, and get an error they
  // can do nothing about. Fail here, for the business, not in front of their
  // client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasSecure = ((form.schema ?? []) as any[]).some((f) => f?.type === "secure");
  if (hasSecure && !secureFieldsAvailable()) {
    return {
      ok: false,
      error: "This form has a secure credential field, but the encryption key isn't set on the server — "
        + "your customer wouldn't be able to submit it. Remove the secure field, or set ONBOARDING_SECRET_KEY.",
    };
  }

  // Check the address BEFORE minting anything. A malformed one (a comma for a
  // dot in a TLD is the common one) is rejected by the mail provider, which
  // threw — leaving a pending request behind and, because Next masks thrown
  // server-action messages in production, no usable reason on screen. From the
  // sender's side that reads as the button doing nothing at all.
  if (opts.email !== false) {
    if (!customer.email) {
      return { ok: false, error: "This customer has no email address — use Copy link instead" };
    }
    if (!looksLikeEmail(customer.email)) {
      return {
        ok: false,
        error: `"${customer.email}" doesn't look like a valid email address — fix it on the customer, or use Copy link instead.`,
      };
    }
  }

  // Reuse an open request for the same form+customer instead of duplicating.
  const { data: openReq } = await tbl(sb, "onboarding_requests")
    .select("id").eq("business_id", businessId).eq("form_id", formId)
    .eq("customer_id", customerId).neq("status", "completed")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  let requestId: string = openReq?.id ?? "";
  if (!requestId) {
    const { data: created, error } = await tbl(sb, "onboarding_requests").insert({
      business_id: businessId, form_id: formId, customer_id: customerId,
    }).select("id").single();
    if (error) throw error;
    requestId = created.id;
  }

  const token = await mintPortalTokenFor(sb, businessId, customerId, opts.createdBy ?? null);
  const url = `${appUrl()}/portal/${token}/onboarding/${requestId}`;

  if (opts.email !== false && customer.email) {
    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f6f4;padding:24px;color:#111">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e3d9;padding:28px">
        <p style="font-size:13px;color:#666;margin:0 0 4px">${biz?.name ?? "Your provider"}</p>
        <h1 style="font-size:20px;margin:0 0 12px">${form.name}</h1>
        <p style="font-size:14px;line-height:1.6;color:#333">Hi ${customer.name ?? "there"}, please fill in a few details so we can get you set up. Your progress saves automatically.</p>
        <p style="margin:24px 0"><a href="${url}" style="background:#2f6f73;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Open the form</a></p>
        <p style="font-size:12px;color:#888">Or paste this link into your browser:<br>${url}</p>
      </div></body></html>`;
    try {
      await sendEmail({
        to: customer.email,
        subject: `${biz?.name ?? "Onboarding"}: ${form.name}`,
        html,
        from: buildBusinessFrom({ name: biz?.name ?? "Kirei", localPart: "onboarding" }),
        replyTo: biz?.email ?? undefined,
        tags: { business_id: businessId, doc_type: "custom", doc_id: requestId },
      });
    } catch (e) {
      // A rejected send used to throw out of the server action, and Next masks
      // those messages in production — so the sender saw nothing actionable
      // while a pending request sat there as if it had gone. Return the reason,
      // and the link, because it exists and works: they can still copy it.
      const why = e instanceof Error ? e.message : "the email provider rejected it";
      console.error("[onboarding/send] email failed:", why);
      return {
        ok: false,
        error: `The form link was created but the email couldn't be sent (${why}). Use Copy link to share it.`,
      };
    }
  }

  return { ok: true, request_id: requestId, url };
}


/**
 * Send an onboarding form to a LEAD.
 *
 * The link is a customer-portal link, so the lead needs a contact row to hang
 * it on — `ensureContactForLead` mints one, exactly as the Quote and Invoice
 * buttons already do. **They stay a lead**: the contact is created at stage
 * 'lead' and only a payment promotes it. Filling in a questionnaire is not
 * buying something.
 *
 * The request itself is therefore customer-scoped (onboarding_requests has a
 * CHECK that exactly one of customer_id/lead_id is set, and the portal page
 * matches the request's customer against the token's). It still shows on the
 * lead, the same way its quotes and invoices do — through leads.customer_id.
 */
export async function sendOnboardingFormToLead(
  sb: Sb,
  businessId: string,
  formId: string,
  leadId: string,
  opts: { email?: boolean; createdBy?: string | null } = {},
): Promise<SendOnboardingResult> {
  let customerId: string;
  try {
    ({ customerId } = await ensureContactForLead(sb, businessId, leadId));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not prepare this lead" };
  }
  return sendOnboardingFormFor(sb, businessId, formId, customerId, opts);
}
