/**
 * Sending a public (Form Builder) form to someone you already have.
 *
 * The public form is built for strangers: a submission at /f/<slug> calls
 * upsert_lead and creates the person. Send that same link to an existing lead
 * and you get a second record of someone already in your pipeline.
 *
 * An invite fixes the direction: one token, one form, one known person. The
 * submit route resolves it and attaches the submission to them, skipping lead
 * creation entirely.
 *
 * Plain module — no "use server", so actions, routes and crons can all use it.
 */
import { randomBytes } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { sendEmail, buildBusinessFrom } from "@/lib/email";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
const tbl = (sb: Sb, name: string) => sb.from(name);

/** Who the form is for. Exactly one, matching the DB's CHECK. */
export type FormSubject =
  | { kind: "lead"; id: string }
  | { kind: "customer"; id: string };

export type SendFormResult =
  | { ok: true; invite_id: string; url: string; emailed: boolean }
  | { ok: false; error: string };

export function inviteUrl(slug: string, token: string): string {
  return `${appUrl()}/f/${slug}?i=${token}`;
}

/**
 * Resolve an invite token to its subject.
 *
 * Returns null for anything not currently usable — unknown, expired, wrong
 * form. The caller then treats the submission as ordinary public traffic
 * rather than rejecting it: someone answering a form they were sent should
 * never see an error because the link aged out. Their answers still land; they
 * just arrive unattached.
 */
export async function resolveInvite(
  sb: Sb, formId: string, token: string | null | undefined,
): Promise<{ id: string; lead_id: string | null; customer_id: string | null } | null> {
  if (!token) return null;
  const { data } = await tbl(sb, "public_form_invites")
    .select("id, form_id, lead_id, customer_id, expires_at")
    .eq("token", token).maybeSingle();
  if (!data || data.form_id !== formId) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  return { id: data.id, lead_id: data.lead_id, customer_id: data.customer_id };
}

/**
 * Mint (or reuse) an invite and optionally email it.
 *
 * Expected failures are RETURNED — Next masks thrown server-action messages in
 * production, and "this form isn't published yet" is a message someone needs.
 */
export async function sendPublicFormTo(
  sb: Sb,
  businessId: string,
  formId: string,
  subject: FormSubject,
  opts: { email?: boolean; createdBy?: string | null } = {},
): Promise<SendFormResult> {
  const subjectCol = subject.kind === "lead" ? "lead_id" : "customer_id";

  const [{ data: form }, { data: person }, { data: biz }] = await Promise.all([
    tbl(sb, "public_forms").select("id, name, slug, status")
      .eq("id", formId).eq("business_id", businessId).maybeSingle(),
    tbl(sb, subject.kind === "lead" ? "leads" : "customers")
      .select("id, name, email").eq("id", subject.id).eq("business_id", businessId).maybeSingle(),
    tbl(sb, "businesses").select("name, email, slug").eq("id", businessId).single(),
  ]);

  if (!form) return { ok: false, error: "Form not found" };
  if (!person) return { ok: false, error: subject.kind === "lead" ? "Lead not found" : "Customer not found" };
  // A draft form 404s at /f/<slug>. Sending its link would be sending a dead
  // end — catch it here, for the business, not in front of their lead.
  if (form.status !== "published") {
    return { ok: false, error: `“${form.name}” isn't published yet — publish it, then send.` };
  }

  // Reuse an unsubmitted invite for the same form+person rather than minting a
  // second token, so "resend" doesn't scatter live links for one questionnaire.
  const { data: existing } = await tbl(sb, "public_form_invites")
    .select("id, token").eq("business_id", businessId).eq("form_id", formId)
    .eq(subjectCol, subject.id).is("submitted_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  let inviteId: string = existing?.id ?? "";
  let token: string = existing?.token ?? "";

  if (!inviteId) {
    token = "inv_" + randomBytes(24).toString("hex");
    const { data: created, error } = await tbl(sb, "public_form_invites").insert({
      business_id: businessId, form_id: formId, token,
      lead_id: subject.kind === "lead" ? subject.id : null,
      customer_id: subject.kind === "customer" ? subject.id : null,
      created_by: opts.createdBy ?? null,
      expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    }).select("id").single();
    if (error) return { ok: false, error: error.message };
    inviteId = created.id;
  }

  const url = inviteUrl(form.slug, token);

  if (opts.email === false) return { ok: true, invite_id: inviteId, url, emailed: false };
  if (!person.email) {
    // Still a success: the invite exists and the link is usable. The caller
    // shows it for copying rather than reporting a failure over a missing
    // email address they may not need.
    return { ok: true, invite_id: inviteId, url, emailed: false };
  }

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f6f4;padding:24px;color:#111">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e3d9;padding:28px">
      <p style="font-size:13px;color:#666;margin:0 0 4px">${biz?.name ?? "Your provider"}</p>
      <h1 style="font-size:20px;margin:0 0 12px">${form.name}</h1>
      <p style="font-size:14px;line-height:1.6;color:#333">Hi ${person.name ?? "there"}, could you fill this in for us? It only takes a moment.</p>
      <p style="margin:24px 0"><a href="${url}" style="background:#2f6f73;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Open the form</a></p>
      <p style="font-size:12px;color:#888">Or paste this link into your browser:<br>${url}</p>
    </div></body></html>`;

  await sendEmail({
    to: person.email,
    subject: `${biz?.name ?? "A quick form"}: ${form.name}`,
    html,
    from: buildBusinessFrom({ name: biz?.name ?? "Kirei", slug: biz?.slug, localPart: "forms" }),
    replyTo: biz?.email ?? undefined,
    tags: { business_id: businessId, doc_type: "custom", doc_id: inviteId },
  });

  await tbl(sb, "public_form_invites")
    .update({ sent_at: new Date().toISOString() }).eq("id", inviteId);

  return { ok: true, invite_id: inviteId, url, emailed: true };
}
