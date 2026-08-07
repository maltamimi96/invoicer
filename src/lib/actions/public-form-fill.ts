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
