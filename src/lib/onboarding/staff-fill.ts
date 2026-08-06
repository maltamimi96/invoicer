/**
 * Staff-filled onboarding — which fields a team member can answer from the
 * dashboard, on the customer's behalf.
 *
 * Plain module (no "use server") so the server action, the MCP tool and the
 * client form all share one definition of what's fillable. If they disagreed,
 * the UI would offer a field the server then silently dropped.
 */
import type { OnboardingField, OnboardingAnswers } from "@/types/database";
import { DISPLAY_ONLY_TYPES, missingRequiredFields } from "./answers";

/**
 * Types staff can't fill in from the dashboard:
 *
 * - `file` / `image` — uploads go through the token-gated portal route; there
 *   is no dashboard equivalent, so offering the field would be a dead end.
 * - `secure` — a credential is the customer's to enter. Typed in by staff it
 *   loses that meaning, and the encryption key may not even be configured.
 *   Stripped server-side too, so a plaintext credential can't reach the
 *   database via a hand-rolled request.
 */
export const STAFF_UNFILLABLE_TYPES = new Set(["file", "image", "secure"]);

export function isStaffFillable(f: OnboardingField): boolean {
  return !STAFF_UNFILLABLE_TYPES.has(f.type);
}

/** The fields to render in a staff-fill form (display-only types included —
 *  headings and instructions still give the form its shape). */
export function staffFillableFields(schema: OnboardingField[]): OnboardingField[] {
  return (schema ?? []).filter(isStaffFillable);
}

/** Fields that still need the customer — surfaced so staff know what's left
 *  rather than believing a half-filled form is complete. */
export function staffOnlyCustomerFields(schema: OnboardingField[]): OnboardingField[] {
  return (schema ?? []).filter((f) => !isStaffFillable(f));
}

/** Drop answers to fields staff aren't allowed to fill, and to fields that
 *  aren't on the form at all. */
export function stripUnfillableAnswers(
  schema: OnboardingField[],
  answers: OnboardingAnswers,
): OnboardingAnswers {
  const allowed = new Set(
    (schema ?? []).filter((f) => isStaffFillable(f) && !DISPLAY_ONLY_TYPES.has(f.type)).map((f) => f.id),
  );
  const out: OnboardingAnswers = {};
  for (const [id, value] of Object.entries(answers ?? {})) {
    if (allowed.has(id)) out[id] = value;
  }
  return out;
}

/**
 * Required fields staff still have to answer.
 *
 * Deliberately ignores required upload/credential fields: staff physically
 * can't provide those, so counting them would make the form unsubmittable.
 * They show up as "still needs the customer" instead.
 */
export function missingForStaff(
  schema: OnboardingField[],
  answers: OnboardingAnswers,
): string[] {
  return missingRequiredFields(staffFillableFields(schema), answers);
}
