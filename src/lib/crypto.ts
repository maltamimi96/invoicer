/**
 * App-wide AES-256-GCM secret encryption — used to store third-party
 * credentials (connector tokens/API keys) at rest. Ciphertext lives in the DB;
 * plaintext is only ever decrypted server-side to make an outbound API call and
 * is NEVER returned to the browser or over MCP.
 *
 * Key: APP_ENCRYPTION_KEY (64 hex chars = 32 bytes), falling back to
 * ONBOARDING_SECRET_KEY so a single key can cover both. Generate with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * Treat it like a database credential — rotating it makes stored secrets
 * unreadable.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function keyHex(): string | undefined {
  return (process.env.APP_ENCRYPTION_KEY ?? process.env.ONBOARDING_SECRET_KEY)?.trim();
}

/** True when an encryption key is configured (credential storage usable). */
export function encryptionAvailable(): boolean {
  const hex = keyHex();
  return Boolean(hex && /^[0-9a-f]{64}$/i.test(hex));
}

function key(): Buffer {
  const hex = keyHex();
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(
      "Credential storage needs APP_ENCRYPTION_KEY (64 hex chars) set on the server.",
    );
  }
  return Buffer.from(hex, "hex");
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
  if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) throw new Error("Malformed secret payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
