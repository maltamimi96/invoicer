"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { slugifyFormName } from "@/lib/forms/slug";
import { sendPublicFormTo, type SendFormResult } from "@/lib/forms/invite";
import { pluginFlagsTag } from "@/lib/layout-data";
import type { PublicForm, PublicFormSubmission, OnboardingField } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

// ── Feature flag (plugin) ────────────────────────────────────────────────────

export interface FormBuilderSettings { business_id: string; enabled: boolean }

export async function getFormBuilderSettings(): Promise<FormBuilderSettings> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data } = await tbl(supabase, "form_builder_settings")
    .select("business_id, enabled").eq("business_id", businessId).maybeSingle();
  if (data) return data as FormBuilderSettings;
  const { data: created, error } = await tbl(supabase, "form_builder_settings")
    .insert({ business_id: businessId, enabled: false })
    .select("business_id, enabled").single();
  if (error) throw error;
  return created as FormBuilderSettings;
}

export async function setFormBuilderEnabled(enabled: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "form_builder_settings")
    .upsert({ business_id: businessId, enabled }, { onConflict: "business_id" });
  if (error) throw error;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (createAdminClient() as any).from("business_agent_installs").upsert(
      { business_id: businessId, agent_id: "form-builder", enabled, updated_at: new Date().toISOString() },
      { onConflict: "business_id,agent_id" },
    );
  } catch { /* non-fatal */ }
  revalidateTag(pluginFlagsTag(businessId), "max"); // layout's cached feature flags
  revalidatePath("/forms");
  revalidatePath("/agents");
  revalidatePath("/", "layout");
}

// ── Slug uniqueness ──────────────────────────────────────────────────────────

/** Globally-unique slug — appends -2, -3… on collision. Uses the admin client
 *  since slugs are unique across businesses. */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const admin = createAdminClient();
  const root = slugifyFormName(base);
  for (let i = 0; i < 200; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (admin as any).from("public_forms").select("id").eq("slug", candidate).maybeSingle();
    if (!data || data.id === excludeId) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

// ── Forms CRUD ───────────────────────────────────────────────────────────────

export async function getPublicForms(): Promise<(PublicForm & { submission_count: number })[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const [{ data: forms, error }, { data: subs }] = await Promise.all([
    tbl(supabase, "public_forms").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
    tbl(supabase, "public_form_submissions").select("form_id").eq("business_id", businessId),
  ]);
  if (error) throw error;
  const counts = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (subs ?? []).forEach((s: any) => counts.set(s.form_id, (counts.get(s.form_id) ?? 0) + 1));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (forms ?? []).map((f: any) => ({ ...f, submission_count: counts.get(f.id) ?? 0 }));
}

export async function getPublicForm(id: string): Promise<PublicForm> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "public_forms")
    .select("*").eq("id", id).eq("business_id", businessId).single();
  if (error) throw error;
  return data as PublicForm;
}

export async function createPublicForm(input: { name: string; description?: string | null }): Promise<PublicForm> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  if (!input.name?.trim()) throw new Error("Form name is required");
  const slug = await uniqueSlug(input.name);
  const { data, error } = await tbl(supabase, "public_forms").insert({
    business_id: businessId, name: input.name.trim(), description: input.description?.trim() || null,
    slug, schema: [], status: "draft",
    settings: { submit_text: "Submit", create_lead: true },
    theme: { show_branding: true },
  }).select().single();
  if (error) throw error;
  revalidatePath("/forms");
  return data as PublicForm;
}

export async function updatePublicForm(id: string, updates: {
  name?: string; description?: string | null; status?: "draft" | "published" | "archived";
  slug?: string;
  schema?: OnboardingField[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme?: Record<string, any>;
}): Promise<{ slug?: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clean: Record<string, any> = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
  if (clean.slug !== undefined) clean.slug = await uniqueSlug(clean.slug || updates.name || "form", id);
  if (Object.keys(clean).length === 0) return {};

  const { error } = await tbl(supabase, "public_forms").update(clean).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/forms");
  revalidatePath(`/forms/${id}`);
  return { slug: clean.slug };
}

export async function deletePublicForm(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "public_forms").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/forms");
}

// ── Submissions ──────────────────────────────────────────────────────────────

export interface SubmissionRow extends PublicFormSubmission {
  leads?: { id: string; name: string } | null;
}

export async function getFormSubmissions(formId: string): Promise<SubmissionRow[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "public_form_submissions")
    .select("*, leads(id, name)")
    .eq("business_id", businessId).eq("form_id", formId)
    .order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as SubmissionRow[];
}

export async function deleteFormSubmission(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "public_form_submissions").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}

/** Signed URL for a submission's uploaded file/image (private bucket). */
export async function getFormUploadUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  if (!path.startsWith(`${businessId}/`)) throw new Error("Not found");
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).storage.from("public-form-uploads").createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl ?? null;
}


// ── Sending a form to someone you already have ──────────────────────────────

/** A form sent to this lead, and whether they have answered it. */
export interface LeadFormRow {
  invite_id: string;
  form_id: string;
  form_name: string;
  slug: string;
  url: string;
  sent_at: string | null;
  submitted_at: string | null;
  submission_id: string | null;
}

export interface LeadFormsData {
  /** Published forms available to send. Drafts are excluded — their link 404s. */
  forms: { id: string; name: string; slug: string }[];
  sent: LeadFormRow[];
}

/** Which custom forms can be sent to this lead, and which already were. */
export async function getLeadForms(leadId: string): Promise<LeadFormsData> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const [{ data: forms }, { data: invites }] = await Promise.all([
    tbl(supabase, "public_forms")
      .select("id, name, slug").eq("business_id", businessId).eq("status", "published")
      .order("name", { ascending: true }).limit(200),
    tbl(supabase, "public_form_invites")
      .select("id, form_id, token, sent_at, submitted_at")
      .eq("business_id", businessId).eq("lead_id", leadId)
      .order("created_at", { ascending: false }).limit(50),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formRows = ((forms ?? []) as any[]);
  const byId = new Map(formRows.map((f) => [f.id, f]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inviteRows = ((invites ?? []) as any[]);
  const inviteIds = inviteRows.map((i) => i.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let subs: any[] = [];
  if (inviteIds.length > 0) {
    const { data } = await tbl(supabase, "public_form_submissions")
      .select("id, invite_id").eq("business_id", businessId).in("invite_id", inviteIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subs = (data ?? []) as any[];
  }
  const subByInvite = new Map(subs.map((s) => [s.invite_id, s.id]));

  const { inviteUrl } = await import("@/lib/forms/invite");

  return {
    forms: formRows.map((f) => ({ id: f.id, name: f.name, slug: f.slug })),
    sent: inviteRows
      // A form deleted after being sent leaves an invite with nothing to show.
      .filter((i) => byId.has(i.form_id))
      .map((i) => ({
        invite_id: i.id,
        form_id: i.form_id,
        form_name: byId.get(i.form_id).name,
        slug: byId.get(i.form_id).slug,
        url: inviteUrl(byId.get(i.form_id).slug, i.token),
        sent_at: i.sent_at,
        submitted_at: i.submitted_at,
        submission_id: subByInvite.get(i.id) ?? null,
      })),
  };
}

/**
 * Send a custom form to a lead.
 *
 * The link carries a one-person invite token, so their answers attach to THIS
 * lead instead of calling upsert_lead and minting a second record of someone
 * already in the pipeline.
 */
export async function sendFormToLead(
  formId: string, leadId: string, opts: { email?: boolean } = {},
): Promise<SendFormResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const res = await sendPublicFormTo(supabase, businessId, formId, { kind: "lead", id: leadId }, {
    email: opts.email, createdBy: user.id,
  });
  if (res.ok) revalidatePath(`/leads/${leadId}`);
  return res;
}

/** Send a custom form to an existing customer. Same invite mechanism. */
export async function sendFormToCustomer(
  formId: string, customerId: string, opts: { email?: boolean } = {},
): Promise<SendFormResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const res = await sendPublicFormTo(supabase, businessId, formId, { kind: "customer", id: customerId }, {
    email: opts.email, createdBy: user.id,
  });
  if (res.ok) revalidatePath(`/customers/${customerId}`);
  return res;
}
