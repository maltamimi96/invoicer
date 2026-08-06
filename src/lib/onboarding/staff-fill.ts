/**
 * Staff-filled onboarding — which fields a team member can answer from the
 * dashboard, on the customer's behalf.
 *
 * Plain module (no "use server") so the server action, the MCP tool and the
 * client form all share one definition of what's fillable. If they disagreed,
 * the UI would offer a field the server then dropped.
 */
import type { OnboardingField, OnboardingAnswers } from "@/types/database";
// From ./validate, not ./answers — this module is imported by client
// components, and answers.ts pulls in node:crypto.
import { DISPLAY_ONLY_TYPES, missingRequiredFields, invalidAnswerFields } from "./validate";

/**
 * Uploads can never be staff-filled: the only upload path is the token-gated
 * portal route, so offering the field from the dashboard is a dead end.
 */
export const STAFF_UPLOAD_TYPES = new Set(["file", "image"]);

export interface StaffFillOptions {
  /**
   * Whether credential (`secure`) fields can be filled here — true only when
   * the server has an encryption key.
   *
   * Staff legitimately hold details a client has handed over: a BSB and
   * account number for a direct debit, say. Refusing those outright just loses
   * the data. Without a key there is nothing to encrypt with, and a credential
   * is never stored in the clear, so the answer depends on the environment
   * rather than being fixed.
   */
  allowSecure?: boolean;
}

export function isStaffFillable(f: OnboardingField, opts: StaffFillOptions = {}): boolean {
  if (STAFF_UPLOAD_TYPES.has(f.type)) return false;
  if (f.type === "secure") return Boolean(opts.allowSecure);
  return true;
}

/** The fields to render in a staff-fill form (display-only types included —
 *  headings and instructions still give the form its shape). */
export function staffFillableFields(
  schema: OnboardingField[], opts: StaffFillOptions = {},
): OnboardingField[] {
  return (schema ?? []).filter((f) => isStaffFillable(f, opts));
}

/** Fields that still need the customer — surfaced so staff know what's left
 *  rather than believing a half-filled form is complete. */
export function staffOnlyCustomerFields(
  schema: OnboardingField[], opts: StaffFillOptions = {},
): OnboardingField[] {
  return (schema ?? []).filter((f) => !isStaffFillable(f, opts));
}

export interface StripResult {
  clean: OnboardingAnswers;
  /**
   * Labels of answers that were thrown away.
   *
   * Never drop these silently. A value typed in and discarded without a word
   * is how an account number vanished and the response page said "Not
   * answered" — the one failure mode worse than refusing outright.
   */
  dropped: string[];
}

export function stripUnfillableAnswers(
  schema: OnboardingField[], answers: OnboardingAnswers, opts: StaffFillOptions = {},
): StripResult {
  const byId = new Map((schema ?? []).map((f) => [f.id, f]));
  const clean: OnboardingAnswers = {};
  const dropped: string[] = [];

  for (const [id, value] of Object.entries(answers ?? {})) {
    const field = byId.get(id);
    // Not on this form, or a type that holds no answer — nothing the user
    // could act on, so drop it quietly.
    if (!field || DISPLAY_ONLY_TYPES.has(field.type)) continue;

    if (isStaffFillable(field, opts)) { clean[id] = value; continue; }
    if (value !== undefined && value !== null && value !== "") dropped.push(field.label || id);
  }
  return { clean, dropped };
}

/**
 * Required fields staff still have to answer.
 *
 * Ignores required fields staff physically can't provide (uploads, and
 * credentials with no key) — counting them would make the form unsubmittable.
 * Those surface as "still needs the customer" instead.
 */
export function missingForStaff(
  schema: OnboardingField[], answers: OnboardingAnswers, opts: StaffFillOptions = {},
): string[] {
  return missingRequiredFields(staffFillableFields(schema, opts), answers);
}

export interface StaffFillProblem { field_id: string; label: string; message: string }

/**
 * Everything wrong with a staff-filled form, ready to show.
 *
 * One implementation for the browser and the server. The add-client screen
 * runs it BEFORE creating the client — finding out afterwards means the client
 * exists but the form doesn't, and you have to re-enter it from their profile.
 * The server runs it again, because a check only the browser performs is not a
 * check.
 */
export function staffFillProblems(
  schema: OnboardingField[], answers: OnboardingAnswers, opts: StaffFillOptions = {},
): StaffFillProblem[] {
  const label = (id: string) => schema.find((f) => f.id === id)?.label ?? id;
  const { clean, dropped } = stripUnfillableAnswers(schema, answers, opts);

  const problems: StaffFillProblem[] = missingForStaff(schema, clean, opts).map((id) => ({
    field_id: id, label: label(id), message: "is required",
  }));

  for (const e of invalidAnswerFields(staffFillableFields(schema, opts), clean)) {
    // Don't pile a format complaint on top of "you haven't filled it in".
    if (problems.some((p) => p.field_id === e.field_id)) continue;
    problems.push({ field_id: e.field_id, label: label(e.field_id), message: e.message });
  }

  // Answered something that can't be kept: say so instead of saving without it.
  for (const label of dropped) {
    problems.push({
      field_id: `__dropped_${label}`, label,
      message: "can only be provided by the customer, through their own link — it wasn't saved",
    });
  }
  return problems;
}

/** One sentence naming what to fix — the fields, not "validation failed". */
export function staffFillErrorMessage(problems: StaffFillProblem[]): string {
  if (problems.length === 0) return "";
  if (problems.length === 1) return `${problems[0].label} ${problems[0].message}`;
  return `Fix these first: ${problems.map((p) => `${p.label} ${p.message}`).join(", ")}`;
}
