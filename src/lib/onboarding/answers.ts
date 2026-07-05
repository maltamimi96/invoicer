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

// ── Format validation ────────────────────────────────────────────────────────

/** ABN checksum (ATO algorithm): subtract 1 from the first digit, apply
 *  weights, total must be divisible by 89. */
export function isValidAbn(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = weights.reduce((acc, w, i) => acc + w * (Number(digits[i]) - (i === 0 ? 1 : 0)), 0);
  return sum % 89 === 0;
}

/** ACN checksum (ASIC algorithm): weights 8..1 over the first 8 digits,
 *  complement of the remainder is the 9th digit. */
export function isValidAcn(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 9) return false;
  const sum = [8, 7, 6, 5, 4, 3, 2, 1].reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[8]);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#].*)?$/i;
const PHONE_RE = /^\+?[0-9 ()\-]{6,20}$/;

export interface AnswerError { field_id: string; message: string }

/** Validate answer FORMATS for non-empty, visible answers. Runs on final
 *  submit alongside missingRequiredFields. Custom `validation.pattern` on a
 *  field (e.g. social-handle presets) is checked after the type-level rules. */
export function invalidAnswerFields(
  schema: OnboardingField[],
  answers: OnboardingAnswers
): AnswerError[] {
  const visible = (f: OnboardingField): boolean => {
    if (!f.show_if?.field_id) return true;
    return String(answers?.[f.show_if.field_id] ?? "") === f.show_if.equals;
  };
  const errors: AnswerError[] = [];

  for (const f of schema) {
    if (DISPLAY_ONLY_TYPES.has(f.type) || !visible(f)) continue;
    const v = answers?.[f.id];
    if (v == null || v === "" || typeof v !== "string") continue; // formats apply to string answers only
    const s = v.trim();
    if (!s) continue;

    // ACN preset rides on short_text — checksum it before the generic pattern.
    if (f.preset === "acn") {
      if (!isValidAcn(s)) errors.push({ field_id: f.id, message: "That doesn't look like a valid ACN (9 digits)" });
      continue;
    }

    switch (f.type) {
      case "email":
        if (!EMAIL_RE.test(s)) errors.push({ field_id: f.id, message: "Enter a valid email address" });
        continue;
      case "url":
        if (!URL_RE.test(s)) errors.push({ field_id: f.id, message: "Enter a valid link (e.g. https://example.com)" });
        continue;
      case "phone":
        if (!PHONE_RE.test(s)) errors.push({ field_id: f.id, message: "Enter a valid phone number" });
        continue;
      case "abn":
        if (!isValidAbn(s)) errors.push({ field_id: f.id, message: "That doesn't look like a valid ABN (11 digits, checksum failed)" });
        continue;
      case "number":
      case "currency":
        if (Number.isNaN(Number(s.replace(/[, ]/g, "")))) errors.push({ field_id: f.id, message: "Enter a number" });
        continue;
    }

    if (f.validation?.pattern) {
      try {
        if (!new RegExp(f.validation.pattern).test(s)) {
          errors.push({ field_id: f.id, message: f.validation.message || "Doesn't match the expected format" });
        }
      } catch { /* bad pattern authored on the form — never block the customer */ }
    }
  }
  return errors;
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
