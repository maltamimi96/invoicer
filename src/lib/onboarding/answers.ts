/**
 * Shared answer-processing helpers (plain module — used by server actions AND
 * the token-gated portal submit route; keep free of "use server").
 */
import type { OnboardingField, OnboardingAnswers } from "@/types/database";
import { encryptSecret, isEncryptedAnswer } from "./crypto";

// Validation lives in ./validate (no crypto import) so client components can
// run it before submitting. Re-exported here so server callers are unchanged.
export {
  DISPLAY_ONLY_TYPES, isValidAbn, isValidAcn, invalidAnswerFields, missingRequiredFields,
} from "./validate";
export type { AnswerError } from "./validate";


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

// Format + required validation: see ./validate.
