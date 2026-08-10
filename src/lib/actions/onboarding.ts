"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { pluginFlagsTag } from "@/lib/layout-data";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { redactSecureAnswers, processAnswersForStorage } from "@/lib/onboarding/answers";
import {
  staffOnlyCustomerFields, stripUnfillableAnswers, staffFillProblems, staffFillErrorMessage,
} from "@/lib/onboarding/staff-fill";
import { decryptSecret, isEncryptedAnswer, secureFieldsAvailable } from "@/lib/onboarding/crypto";
import { sendOnboardingFormFor, sendOnboardingFormToLead, type SendOnboardingResult } from "@/lib/onboarding/send";
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
export async function sendOnboardingRequest(
  formId: string, customerId: string, opts: { email?: boolean } = {},
): Promise<SendOnboardingResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // The work lives in lib/onboarding/send.ts, which takes the business id
  // explicitly so a cron or an automation can send too. This resolves WHO.
  const res = await sendOnboardingFormFor(supabase, businessId, formId, customerId, {
    email: opts.email, createdBy: user.id,
  });

  if (res.ok) {
    revalidatePath("/onboarding-forms");
    revalidatePath(`/customers/${customerId}`);
  }
  return res;
}

export type StaffFillResult =
  | { ok: true; request_id: string; saved: number; needs_customer: number }
  | { ok: false; error: string };

/**
 * Record an onboarding form filled in by staff on the customer's behalf —
 * the "I already have these details, I'll type them in" path.
 *
 * It lands as a normal completed request + response, so it appears in the
 * customer's Onboarding tab and the form's responses exactly like a
 * customer-submitted one. Upload and credential fields are stripped (see
 * lib/onboarding/staff-fill.ts) — staff can't provide those, and a
 * credential typed by someone other than its owner isn't one.
 */
/** Who a form is about. Exactly one of these, enforced by a CHECK in the DB. */
export type OnboardingSubject =
  | { kind: "customer"; id: string }
  | { kind: "lead"; id: string };

export async function saveStaffOnboardingResponse(
  formId: string, customerId: string, answers: Record<string, unknown>,
): Promise<StaffFillResult> {
  return saveStaffOnboardingFor(formId, { kind: "customer", id: customerId }, answers);
}

/** Same thing for a lead — qualifying one means asking the same questions. */
export async function saveLeadOnboardingResponse(
  formId: string, leadId: string, answers: Record<string, unknown>,
): Promise<StaffFillResult> {
  return saveStaffOnboardingFor(formId, { kind: "lead", id: leadId }, answers);
}

async function saveStaffOnboardingFor(
  formId: string, subject: OnboardingSubject, answers: Record<string, unknown>,
): Promise<StaffFillResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const subjectTable = subject.kind === "customer" ? "customers" : "leads";
  const [{ data: form }, { data: subjectRow }] = await Promise.all([
    tbl(supabase, "onboarding_forms").select("id, schema").eq("id", formId).eq("business_id", businessId).maybeSingle(),
    tbl(supabase, subjectTable).select("id").eq("id", subject.id).eq("business_id", businessId).maybeSingle(),
  ]);
  // Returned, not thrown — Next masks thrown server-action messages in prod.
  if (!form) return { ok: false, error: "Form not found" };
  if (!subjectRow) return { ok: false, error: subject.kind === "customer" ? "Customer not found" : "Lead not found" };
  // Exactly one of these is set, matching the DB CHECK.
  const subjectCols = subject.kind === "customer"
    ? { customer_id: subject.id, lead_id: null }
    : { customer_id: null, lead_id: subject.id };

  const schema = (form.schema ?? []) as OnboardingField[];
  if (schema.length === 0) return { ok: false, error: "That form has no fields yet" };

  // Credentials are fillable here only when there's a key to encrypt them
  // with — never stored in the clear.
  const opts = { allowSecure: secureFieldsAvailable() };
  const { clean } = stripUnfillableAnswers(schema, answers ?? {}, opts);
  // Same check the browser ran before creating the client — repeated here
  // because a check only the client performs isn't one.
  const problems = staffFillProblems(schema, answers ?? {}, opts);
  if (problems.length) return { ok: false, error: staffFillErrorMessage(problems) };
  const stored = processAnswersForStorage(schema, clean);

  // Reuse an open request for this form+subject rather than stacking a second
  // one — otherwise "send it, then fill it in yourself" leaves two rows.
  const subjectCol = subject.kind === "customer" ? "customer_id" : "lead_id";
  const { data: openReq } = await tbl(supabase, "onboarding_requests")
    .select("id").eq("business_id", businessId).eq("form_id", formId)
    .eq(subjectCol, subject.id).neq("status", "completed")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const now = new Date().toISOString();
  let requestId: string = openReq?.id ?? "";
  if (requestId) {
    const { error } = await tbl(supabase, "onboarding_requests")
      .update({ status: "completed", completed_at: now }).eq("id", requestId).eq("business_id", businessId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: created, error } = await tbl(supabase, "onboarding_requests").insert({
      business_id: businessId, form_id: formId, ...subjectCols,
      status: "completed", completed_at: now,
    }).select("id").single();
    if (error) return { ok: false, error: error.message };
    requestId = created.id;
  }

  // schema_snapshot is the FULL form, not just what staff could fill — the
  // viewer should show the upload fields as unanswered rather than pretend
  // they were never asked for.
  const { error: respErr } = await tbl(supabase, "onboarding_responses").upsert({
    business_id: businessId, request_id: requestId, form_id: formId, ...subjectCols,
    // `stored`, not `clean`: secure answers must be encrypted before they land.
    // This said `clean` from #449 onward — the encrypted value was computed and
    // thrown away, so a staff-filled credential went into the row in plaintext.
    answers: stored, schema_snapshot: schema, draft: false, submitted_at: now,
  }, { onConflict: "request_id" });
  if (respErr) return { ok: false, error: respErr.message };

  revalidatePath("/onboarding-forms");
  revalidatePath(subject.kind === "customer" ? `/customers/${subject.id}` : `/leads/${subject.id}`);
  return {
    ok: true,
    request_id: requestId,
    saved: Object.keys(clean).length,
    needs_customer: staffOnlyCustomerFields(schema, opts).length,
  };
}

/**
 * Correct a submitted response.
 *
 * Customers mistype things, and staff fill these in from a phone call. Before
 * this, a wrong answer could only be fixed by deleting the whole thing and
 * sending the form again.
 *
 * A blank secure field KEEPS the stored value rather than wiping it: the
 * editor can't show what's there (that's the point of a credential), so an
 * empty box means "leave it", not "delete it".
 */
export async function updateOnboardingResponse(
  requestId: string, answers: Record<string, unknown>,
): Promise<StaffFillResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: existing } = await tbl(supabase, "onboarding_responses")
    .select("id, form_id, customer_id, answers, schema_snapshot")
    .eq("request_id", requestId).eq("business_id", businessId).maybeSingle();
  if (!existing) return { ok: false, error: "No response to edit yet" };

  const schema = (existing.schema_snapshot ?? []) as OnboardingField[];
  const opts = { allowSecure: secureFieldsAvailable() };
  const { clean } = stripUnfillableAnswers(schema, answers ?? {}, opts);

  // Uploads and (keyless) credentials aren't editable here, so carry the
  // existing values through instead of validating against a blank.
  const merged: Record<string, unknown> = { ...(existing.answers ?? {}) };
  for (const [id, v] of Object.entries(clean)) {
    const isSecure = schema.find((f) => f.id === id)?.type === "secure";
    if (isSecure && (v === "" || v == null)) continue; // blank = keep what's stored
    merged[id] = v;
  }

  const problems = staffFillProblems(schema, merged, opts);
  if (problems.length) return { ok: false, error: staffFillErrorMessage(problems) };

  const { error } = await tbl(supabase, "onboarding_responses")
    .update({ answers: processAnswersForStorage(schema, merged), draft: false })
    .eq("id", existing.id).eq("business_id", businessId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/onboarding-forms");
  revalidatePath(`/customers/${existing.customer_id}`);
  return {
    ok: true, request_id: requestId,
    saved: Object.keys(merged).length,
    needs_customer: staffOnlyCustomerFields(schema, opts).length,
  };
}

export interface OnboardingRequestRow extends OnboardingRequest {
  customers?: { name: string; email: string | null } | null;
  onboarding_forms?: { name: string } | null;
}

export async function getOnboardingRequests(filter: { form_id?: string; customer_id?: string; lead_id?: string } = {}): Promise<OnboardingRequestRow[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  let q = tbl(supabase, "onboarding_requests")
    .select("*, customers(name, email), onboarding_forms(name)")
    .eq("business_id", businessId).order("created_at", { ascending: false }).limit(200);
  if (filter.form_id) q = q.eq("form_id", filter.form_id);
  if (filter.customer_id) q = q.eq("customer_id", filter.customer_id);
  if (filter.lead_id) q = q.eq("lead_id", filter.lead_id);
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

/**
 * All of a LEAD's responses (secure answers redacted).
 *
 * Two sources, because a lead's answers can arrive two ways and the DB's
 * subject CHECK allows exactly one owner per row:
 *
 *   lead_id      — staff typed the answers in on the lead's behalf.
 *   customer_id  — the lead was SENT the form and filled it in themselves.
 *                  Portal links hang off a contact row, so those rows are
 *                  customer-scoped and reachable only through leads.customer_id
 *                  — the same route by which a lead's quotes and invoices show.
 *
 * Fetched as two queries rather than one `.or()`: PostgREST's or-grammar uses
 * `,` and `.` as separators, and this codebase has already been burnt by
 * building those strings (PR #398).
 */
export async function getOnboardingResponsesForLead(leadId: string): Promise<OnboardingResponse[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: lead } = await tbl(supabase, "leads")
    .select("customer_id").eq("id", leadId).eq("business_id", businessId).maybeSingle();
  const customerId: string | null = lead?.customer_id ?? null;

  const [own, viaContact] = await Promise.all([
    tbl(supabase, "onboarding_responses")
      .select("*").eq("lead_id", leadId).eq("business_id", businessId)
      .order("created_at", { ascending: false }),
    customerId
      ? tbl(supabase, "onboarding_responses")
          .select("*").eq("customer_id", customerId).eq("business_id", businessId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = [...((own.data ?? []) as any[]), ...((viaContact.data ?? []) as any[])]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  return rows.map((r) => ({
    ...r,
    answers: redactSecureAnswers((r.schema_snapshot ?? []) as OnboardingField[], r.answers ?? {}),
  })) as OnboardingResponse[];
}

/**
 * Send an onboarding form to a lead so they fill it in themselves.
 *
 * Creates the lead's contact row if it doesn't have one (same as quoting them)
 * and emails a portal link. They remain a lead — only payment makes a client.
 */
export async function sendOnboardingToLead(
  formId: string, leadId: string, opts: { email?: boolean } = {},
): Promise<SendOnboardingResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const res = await sendOnboardingFormToLead(supabase, businessId, formId, leadId, {
    email: opts.email, createdBy: user.id,
  });

  if (res.ok) {
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/onboarding-forms");
  }
  return res;
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
