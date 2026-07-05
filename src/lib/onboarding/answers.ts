/**
 * Shared answer-processing helpers (plain module — used by server actions AND
 * the token-gated portal submit route; keep free of "use server").
 */
import type { OnboardingField, OnboardingAnswers } from "@/types/database";
import { encryptSecret, isEncryptedAnswer } from "./crypto";

/** Field types that never hold an answer. */
export const DISPLAY_ONLY_TYPES = new Set(["instructions", "heading", "divider"]);

/** Encrypt secure-field values before storage; pass everything else through.
 *  Already-encrypted values (autosave round-trips) are left as-is. */
export function processAnswersForStorage(
  schema: OnboardingField[],
  answers: OnboardingAnswers
): OnboardingAnswers {
  const secureIds = new Set(schema.filter((f) => f.type === "secure").map((f) => f.id));
  const out: OnboardingAnswers = {};
  for (const [id, value] of Object.entries(answers ?? {})) {
    if (secureIds.has(id) && value != null && value !== "") {
      out[id] = isEncryptedAnswer(value) ? value : { enc: encryptSecret(String(value)) };
    } else {
      out[id] = value;
    }
  }
  return out;
}

/** Replace secure-field answers with a redaction marker (for lists, MCP, agents). */
export function redactSecureAnswers(
  schema: OnboardingField[],
  answers: OnboardingAnswers
): OnboardingAnswers {
  const secureIds = new Set(schema.filter((f) => f.type === "secure").map((f) => f.id));
  const out: OnboardingAnswers = {};
  for (const [id, value] of Object.entries(answers ?? {})) {
    out[id] = secureIds.has(id) && value != null && value !== ""
      ? { secure: true, redacted: "••••••••" }
      : value;
  }
  return out;
}

/** Validate required fields (honouring simple show_if visibility). Returns
 *  the ids of missing required fields — empty array = valid. */
export function missingRequiredFields(
  schema: OnboardingField[],
  answers: OnboardingAnswers
): string[] {
  const visible = (f: OnboardingField): boolean => {
    if (!f.show_if?.field_id) return true;
    return String(answers?.[f.show_if.field_id] ?? "") === f.show_if.equals;
  };
  return schema
    .filter((f) => f.required && !DISPLAY_ONLY_TYPES.has(f.type) && visible(f))
    .filter((f) => {
      const v = answers?.[f.id];
      if (v == null || v === "") return true;
      if (Array.isArray(v) && v.length === 0) return true;
      return false;
    })
    .map((f) => f.id);
}
