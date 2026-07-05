/**
 * AES-256-GCM encryption for onboarding "secure" fields (client credentials
 * like Instagram passwords). Plaintext never touches the database — answers
 * store `{ enc: "<v1.iv.tag.ciphertext>" }` and are decrypted server-side only
 * on an explicit owner/admin reveal. MCP/agent reads always redact these.
 *
 * Key: ONBOARDING_SECRET_KEY env var — 64 hex chars (32 bytes). Generate with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * Rotating the key makes previously-stored secrets unreadable — treat it like
 * a database credential.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function key(): Buffer {
  const hex = process.env.ONBOARDING_SECRET_KEY?.trim();
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(
      "Secure fields need ONBOARDING_SECRET_KEY (64 hex chars) set in the environment."
    );
  }
  return Buffer.from(hex, "hex");
}

/** True when the encryption key is configured (secure fields usable). */
export function secureFieldsAvailable(): boolean {
  const hex = process.env.ONBOARDING_SECRET_KEY?.trim();
  return Boolean(hex && /^[0-9a-f]{64}$/i.test(hex));
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(".");
  if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) throw new Error("Malformed secure payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

/** Shape stored in answers JSONB for secure fields. */
export interface EncryptedAnswer { enc: string }
export function isEncryptedAnswer(v: unknown): v is EncryptedAnswer {
  return typeof v === "object" && v !== null && typeof (v as EncryptedAnswer).enc === "string";
}
