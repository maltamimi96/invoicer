"use server";

/**
 * Filling a PUBLIC form (Form Builder) on behalf of a client or lead.
 *
 * The two form systems share the same field engine — `public_forms.schema` is
 * `OnboardingField[]` — so the renderer, the staff-fill rules and the
 * validation all work unchanged. What differs is where answers land: a public
 * form's answers belong in public_form_submissions, where the form's own
 * Submissions tab already reads them.
 *
 * Expected failures are RETURNED, not thrown.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import {
  stripUnfillableAnswers, staffFillProblems, staffFillErrorMessage,
} from "@/lib/onboarding/staff-fill";
import type { OnboardingField } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export type PublicFormFillResult =
  | { ok: true; submission_id: string; saved: number }
  | { ok: false; error: string };

export async function savePublicFormFill(
  formId: string,
  subject: { kind: "customer" | "lead"; id: string },
  answers: Record<string, unknown>,
): Promise<PublicFormFillResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const subjectTable = subject.kind === "customer" ? "customers" : "leads";
  const [{ data: form }, { data: subjectRow }] = await Promise.all([
    tbl(supabase, "public_forms").select("id, name, schema")
      .eq("id", formId).eq("business_id", businessId).maybeSingle(),
    tbl(supabase, subjectTable).select("id")
      .eq("id", subject.id).eq("business_id", businessId).maybeSingle(),
  ]);
  if (!form) return { ok: false, error: "Form not found" };
  if (!subjectRow) {
    return { ok: false, error: subject.kind === "customer" ? "Client not found" : "Lead not found" };
  }

  const schema = (form.schema ?? []) as OnboardingField[];
  if (schema.length === 0) return { ok: false, error: "That form has no fields yet" };

  // Public forms exclude `secure` by design, so there's nothing to encrypt —
  // but uploads still can't be staff-filled, and a dropped answer is reported
  // rather than swallowed. Same rules as the onboarding side.
  const opts = { allowSecure: false };
  const problems = staffFillProblems(schema, answers ?? {}, opts);
  if (problems.length) return { ok: false, error: staffFillErrorMessage(problems) };
  const { clean } = stripUnfillableAnswers(schema, answers ?? {}, opts);

  const { data, error } = await tbl(supabase, "public_form_submissions").insert({
    business_id: businessId,
    form_id: formId,
    answers: clean,
    customer_id: subject.kind === "customer" ? subject.id : null,
    lead_id: subject.kind === "lead" ? subject.id : null,
    // Marks it as entered by staff rather than submitted from the web, so the
    // Submissions tab isn't misleading about where it came from.
    meta: { filled_by: "staff", user_id: user.id },
  }).select("id").single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(subject.kind === "customer" ? `/customers/${subject.id}` : `/leads/${subject.id}`);
  revalidatePath(`/forms/${formId}`);
  return { ok: true, submission_id: data.id, saved: Object.keys(clean).length };
}

/** Public forms staff can fill in — only ones with fillable fields. */
export async function getFillablePublicForms(): Promise<Array<{ id: string; name: string; schema: OnboardingField[] }>> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: settings } = await tbl(supabase, "form_builder_settings")
    .select("enabled").eq("business_id", businessId).maybeSingle();
  if (!settings?.enabled) return [];

  const { data } = await tbl(supabase, "public_forms")
    .select("id, name, schema, status").eq("business_id", businessId)
    .neq("status", "archived").order("created_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .filter((f) => (f.schema?.length ?? 0) > 0)
    .map((f) => ({ id: f.id, name: f.name, schema: f.schema as OnboardingField[] }));
}

/**
 * Custom-form answers recorded against a lead.
 *
 * These live in `public_form_submissions`, NOT `onboarding_responses` — two
 * form systems, two tables. The lead page read only the onboarding table, so a
 * custom form filled in against a lead saved successfully, said "Saved", and
 * then appeared nowhere. Confirmed against production: one such row existed.
 *
 * Both routes in, like the onboarding side: rows attached to the lead itself,
 * and rows attached to the contact the lead was given when it was quoted.
 *
 * Shaped to match OnboardingResponse so the lead card can render one list.
 * `schema_snapshot` is the form's CURRENT schema — public forms don't snapshot,
 * so an edited form re-labels old answers. Worth knowing; better than hiding
 * them.
 */
export async function getPublicFormFillsForLead(leadId: string): Promise<Array<{
  id: string;
  form_id: string;
  request_id: string;
  kind: "public";
  answers: Record<string, unknown>;
  schema_snapshot: OnboardingField[];
  submitted_at: string | null;
  created_at: string;
}>> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: lead } = await tbl(supabase, "leads")
    .select("customer_id").eq("id", leadId).eq("business_id", businessId).maybeSingle();
  const customerId: string | null = lead?.customer_id ?? null;

  // Two queries rather than one .or(): PostgREST's or-grammar uses , and . as
  // separators and this repo has been burnt building those strings (PR #398).
  const [own, viaContact] = await Promise.all([
    tbl(supabase, "public_form_submissions")
      .select("id, form_id, answers, created_at, public_forms(name, schema)")
      .eq("business_id", businessId).eq("lead_id", leadId)
      .order("created_at", { ascending: false }).limit(50),
    customerId
      ? tbl(supabase, "public_form_submissions")
          .select("id, form_id, answers, created_at, public_forms(name, schema)")
          .eq("business_id", businessId).eq("customer_id", customerId)
          .order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = [...((own.data ?? []) as any[]), ...((viaContact.data ?? []) as any[])]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  return rows.map((r) => ({
    id: r.id,
    form_id: r.form_id,
    // The card links by request_id; a submission is its own "request".
    request_id: r.id,
    kind: "public" as const,
    answers: (r.answers ?? {}) as Record<string, unknown>,
    schema_snapshot: ((r.public_forms?.schema ?? []) as OnboardingField[]),
    submitted_at: r.created_at,
    created_at: r.created_at,
  }));
}
