import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * The vault's whole security claim rests on this file. Uses a throwaway key
 * set per-test — never the real APP_ENCRYPTION_KEY.
 *
 * crypto.ts reads process.env at call time (not at import), which is what
 * makes swapping the key mid-test possible — and is also why the "wrong key"
 * case below is a genuine test of the failure, not a simulation of it.
 */
const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

let saved: { app?: string; onboarding?: string };

beforeEach(() => {
  saved = { app: process.env.APP_ENCRYPTION_KEY, onboarding: process.env.ONBOARDING_SECRET_KEY };
  process.env.APP_ENCRYPTION_KEY = KEY_A;
  delete process.env.ONBOARDING_SECRET_KEY;
});

afterEach(() => {
  if (saved.app === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = saved.app;
  if (saved.onboarding === undefined) delete process.env.ONBOARDING_SECRET_KEY;
  else process.env.ONBOARDING_SECRET_KEY = saved.onboarding;
});

describe("secret encryption", () => {
  it("round-trips, including unicode and long values", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    for (const plain of ["hunter2", "p@ss wörd — ✓", "x".repeat(4000), "{\"json\":true}"]) {
      expect(decryptSecret(encryptSecret(plain))).toBe(plain);
    }
  });

  it("produces different ciphertext each time for the same input", async () => {
    // A fresh IV per call. Without it, two clients sharing a password would be
    // visibly identical in a database dump.
    const { encryptSecret } = await import("./crypto");
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
  });

  it("never contains the plaintext", async () => {
    const { encryptSecret } = await import("./crypto");
    expect(encryptSecret("SuperSecret123")).not.toContain("SuperSecret123");
  });

  it("refuses to decrypt with a different key", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const payload = encryptSecret("hunter2");
    process.env.APP_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptSecret(payload)).toThrow();
  });

  it("refuses tampered ciphertext (GCM auth tag)", async () => {
    // Authenticated encryption: a flipped byte must fail loudly, not decrypt
    // to garbage that then gets shown to someone as a password.
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const [v, iv, tag, ct] = encryptSecret("hunter2").split(".");
    const buf = Buffer.from(ct, "base64");
    buf[0] ^= 0xff;
    expect(() => decryptSecret([v, iv, tag, buf.toString("base64")].join("."))).toThrow();
  });

  it("reports unavailable rather than throwing when no key is set", async () => {
    // This is what makes the vault refuse to save instead of storing
    // plaintext — the check must be a boolean, not an exception.
    const { encryptionAvailable } = await import("./crypto");
    expect(encryptionAvailable()).toBe(true);
    delete process.env.APP_ENCRYPTION_KEY;
    expect(encryptionAvailable()).toBe(false);
    process.env.APP_ENCRYPTION_KEY = "too-short";
    expect(encryptionAvailable()).toBe(false);
  });
});
