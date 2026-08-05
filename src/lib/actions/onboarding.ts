"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { pluginFlagsTag } from "@/lib/layout-data";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { redactSecureAnswers } from "@/lib/onboarding/answers";
import { decryptSecret, isEncryptedAnswer, secureFieldsAvailable } from "@/lib/onboarding/crypto";
import type {
  OnboardingForm, OnboardingField, OnboardingRequest, OnboardingResponse,
} from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

// ── Feature flag (plugin enable/disable, mirrors quoting agent) ─────────────

export interface OnboardingSettings { business_id: string; enabled: boolean }

export async function getOnboardingSettings(): Promise<OnboardingSettings> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data } = await tbl(supabase, "onboarding_settings")
    .select("business_id, enabled").eq("business_id", businessId).maybeSingle();
  if (data) return data as OnboardingSettings;
  const { data: created, error } = await tbl(supabase, "onboarding_settings")
    .insert({ business_id: businessId, enabled: false })
    .select("business_id, enabled").single();
  if (error) throw error;
  return created as OnboardingSettings;
}

export async function setOnboardingEnabled(enabled: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "onboarding_settings")
    .upsert({ business_id: businessId, enabled }, { onConflict: "business_id" });
  if (error) throw error;
  // Mirror into the Agents store so the "Client Onboarding" card reflects state
  // no matter which side was toggled. Best-effort.
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (createAdminClient() as any).from("business_agent_installs").upsert(
      { business_id: businessId, agent_id: "client-onboarding", enabled, updated_at: new Date().toISOString() },
      { onConflict: "business_id,agent_id" },
    );
  } catch { /* non-fatal */ }
  revalidateTag(pluginFlagsTag(businessId), "max"); // layout's cached feature flags
  revalidatePath("/onboarding-forms");
  revalidatePath("/agents");
  revalidatePath("/", "layout"); // sidebar flag
}

/** Whether the secure-credential field type can be offered (env key present). */
export async function getSecureFieldsAvailable(): Promise<boolean> {
  return secureFieldsAvailable();
}

// ── Forms CRUD ──────────────────────────────────────────────────────────────

export async function getOnboardingForms(): Promise<(OnboardingForm & { request_count: number; completed_count: number })[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const [{ data: forms, error }, { data: reqs }] = await Promise.all([
    tbl(supabase, "onboarding_forms").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
    tbl(supabase, "onboarding_requests").select("form_id, status").eq("business_id", businessId),
  ]);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const counts = new Map<string, { total: number; done: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (reqs ?? []).forEach((r: any) => {
    const c = counts.get(r.form_id) ?? { total: 0, done: 0 };
    c.total++; if (r.status === "completed") c.done++;
    counts.set(r.form_id, c);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (forms ?? []).map((f: any) => ({
    ...f,
    request_count: counts.get(f.id)?.total ?? 0,
    completed_count: counts.get(f.id)?.done ?? 0,
  }));
}

export async function getOnboardingForm(id: string): Promise<OnboardingForm> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "onboarding_forms")
    .select("*").eq("id", id).eq("business_id", businessId).single();
  if (error) throw error;
  return data as OnboardingForm;
}

export async function createOnboardingForm(input: {
  name: string; description?: string | null; schema?: OnboardingField[];
}): Promise<OnboardingForm> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  if (!input.name?.trim()) throw new Error("Form name is required");
  const { data, error } = await tbl(supabase, "onboarding_forms").insert({
    business_id: businessId, name: input.name.trim(),
    description: input.description?.trim() || null,
    schema: input.schema ?? [], status: "draft",
  }).select().single();
  if (error) throw error;
  revalidatePath("/onboarding-forms");
  return data as OnboardingForm;
}

export async function updateOnboardingForm(id: string, updates: {
  name?: string; description?: string | null; status?: "draft" | "active" | "archived";
  schema?: OnboardingField[];
  settings?: { thank_you_message?: string; allow_edit_after_submit?: boolean };
}): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) return;
  const { error } = await tbl(supabase, "onboarding_forms")
    .update(clean).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/onboarding-forms");
  revalidatePath(`/onboarding-forms/${id}`);
}

export async function deleteOnboardingForm(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "onboarding_forms")
    .delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/onboarding-forms");
}

// ── Requests (send a form to a customer via the portal) ─────────────────────

async function mintPortalToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string, customerId: string, userId: string,
): Promise<string> {
  const { data: existing } = await tbl(supabase, "customer_portal_tokens")
    .select("token").eq("business_id", businessId).eq("customer_id", customerId)
    .is("revoked_at", null)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing?.token) return existing.token as string;
  const token = "cust_" + randomBytes(24).toString("hex");
  const { error } = await tbl(supabase, "customer_portal_tokens").insert({
    token, business_id: businessId, customer_id: customerId, created_by: userId,
    expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  });
  if (error) throw error;
  return token;
}

/** Send an onboarding form to a customer: creates the request, mints/reuses a
 *  portal token, and emails the fill link. Returns the link either way. */
export async function sendOnboardingRequest(formId: string, customerId: string, opts: { email?: boolean } = {}): Promise<{ request_id: string; url: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const [{ data: form }, { data: customer }, { data: biz }] = await Promise.all([
    tbl(supabase, "onboarding_forms").select("id, name, status, schema").eq("id", formId).eq("business_id", businessId).maybeSingle(),
    tbl(supabase, "customers").select("id, name, email").eq("id", customerId).eq("business_id", businessId).maybeSingle(),
    tbl(supabase, "businesses").select("name, email").eq("id", businessId).single(),
  ]);
  if (!form) throw new Error("Form not found");
  if (!customer) throw new Error("Customer not found");
  if ((form.schema ?? []).length === 0) throw new Error("Add at least one field before sending");

  // A form with a secure field can't be submitted while the encryption key is
  // missing — the customer would fill it in, hit save, and get an error they
  // can do nothing about. Fail here, for the business, rather than in front of
  // their client. The builder blocks adding these fields, but the MCP tools
  // can create them, so this is the last line before a customer sees it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasSecure = ((form.schema ?? []) as any[]).some((f) => f?.type === "secure");
  if (hasSecure && !secureFieldsAvailable()) {
    throw new Error(
      "This form has a secure credential field, but ONBOARDING_SECRET_KEY isn't set on the server — "
      + "your customer wouldn't be able to submit it. Set the key, or remove the secure field.",
    );
  }

  // Reuse an open request for the same form+customer instead of duplicating.
  const { data: openReq } = await tbl(supabase, "onboarding_requests")
    .select("id").eq("business_id", businessId).eq("form_id", formId)
    .eq("customer_id", customerId).neq("status", "completed")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  let requestId: string = openReq?.id ?? "";
  if (!requestId) {
    const { data: created, error } = await tbl(supabase, "onboarding_requests").insert({
      business_id: businessId, form_id: formId, customer_id: customerId,
    }).select("id").single();
    if (error) throw error;
    requestId = created.id;
  }

  const token = await mintPortalToken(supabase, businessId, customerId, user.id);
  const url = `${appUrl()}/portal/${token}/onboarding/${requestId}`;

  const shouldEmail = opts.email !== false;
  if (shouldEmail) {
    if (!customer.email) throw new Error("This customer has no email address — use Copy link instead");
    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f6f4;padding:24px;color:#111">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e3d9;padding:28px">
        <p style="font-size:13px;color:#666;margin:0 0 4px">${biz?.name ?? "Your provider"}</p>
        <h1 style="font-size:20px;margin:0 0 12px">${form.name}</h1>
        <p style="font-size:14px;line-height:1.6;color:#333">Hi ${customer.name ?? "there"}, please fill in a few details so we can get you set up. Your progress saves automatically.</p>
        <p style="margin:24px 0"><a href="${url}" style="background:#2f6f73;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Open the form</a></p>
        <p style="font-size:12px;color:#888">Or paste this link into your browser:<br>${url}</p>
      </div></body></html>`;
    await sendEmail({
      to: customer.email,
      subject: `${biz?.name ?? "Onboarding"}: ${form.name}`,
      html,
      from: buildBusinessFrom({ name: biz?.name ?? "Kirei", slug: biz?.slug, localPart: "onboarding" }),
      replyTo: biz?.email ?? undefined,
      tags: { business_id: businessId, doc_type: "custom", doc_id: requestId },
    });
  }

  revalidatePath("/onboarding-forms");
  revalidatePath(`/customers/${customerId}`);
  return { request_id: requestId, url };
}

export interface OnboardingRequestRow extends OnboardingRequest {
  customers?: { name: string; email: string | null } | null;
  onboarding_forms?: { name: string } | null;
}

export async function getOnboardingRequests(filter: { form_id?: string; customer_id?: string } = {}): Promise<OnboardingRequestRow[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  let q = tbl(supabase, "onboarding_requests")
    .select("*, customers(name, email), onboarding_forms(name)")
    .eq("business_id", businessId).order("created_at", { ascending: false }).limit(200);
  if (filter.form_id) q = q.eq("form_id", filter.form_id);
  if (filter.customer_id) q = q.eq("customer_id", filter.customer_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as OnboardingRequestRow[];
}

export async function deleteOnboardingRequest(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "onboarding_requests")
    .delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/onboarding-forms");
}

// ── Responses ───────────────────────────────────────────────────────────────

/** Response with secure answers REDACTED (safe default for all UI lists). */
export async function getOnboardingResponse(requestId: string): Promise<(OnboardingResponse & { redacted: true }) | null> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data } = await tbl(supabase, "onboarding_responses")
    .select("*").eq("request_id", requestId).eq("business_id", businessId).maybeSingle();
  if (!data) return null;
  const schema = (data.schema_snapshot ?? []) as OnboardingField[];
  return { ...data, answers: redactSecureAnswers(schema, data.answers ?? {}), redacted: true };
}

/** All of a customer's responses (secure answers redacted) — for the profile tab. */
export async function getOnboardingResponsesForCustomer(customerId: string): Promise<OnboardingResponse[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data } = await tbl(supabase, "onboarding_responses")
    .select("*").eq("customer_id", customerId).eq("business_id", businessId)
    .order("created_at", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    answers: redactSecureAnswers((r.schema_snapshot ?? []) as OnboardingField[], r.answers ?? {}),
  })) as OnboardingResponse[];
}

/** Explicit owner/admin-only reveal of ONE secure answer. */
export async function revealSecureAnswer(responseId: string, fieldId: string): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // Owner or admin only — editors/viewers can see the form but not credentials.
  const { data: biz } = await tbl(supabase, "businesses").select("user_id").eq("id", businessId).single();
  if (biz?.user_id !== user.id) {
    const { data: m } = await tbl(supabase, "business_members")
      .select("role").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (m?.role !== "admin") throw new Error("Only the owner or an admin can reveal credentials");
  }

  const { data: resp } = await tbl(supabase, "onboarding_responses")
    .select("answers").eq("id", responseId).eq("business_id", businessId).single();
  const value = resp?.answers?.[fieldId];
  if (!isEncryptedAnswer(value)) throw new Error("No secure value stored for this field");
  return decryptSecret(value.enc);
}

/** Signed URL for a customer-uploaded file/image answer. */
export async function getOnboardingUploadUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  // Paths are namespaced by business id — refuse anything outside our own.
  if (!path.startsWith(`${businessId}/`)) throw new Error("Not found");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).storage.from("onboarding-uploads").createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl ?? null;
}
