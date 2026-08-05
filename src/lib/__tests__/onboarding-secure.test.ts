import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { secureFieldsAvailable } from "@/lib/onboarding/crypto";

/**
 * Secure onboarding fields encrypt client credentials with
 * ONBOARDING_SECRET_KEY. Without a valid key the feature must be UNAVAILABLE
 * rather than half-working — a form that accepts a credential it can't encrypt
 * is worse than one that refuses the field.
 */
describe("secure onboarding fields availability", () => {
  const original = process.env.ONBOARDING_SECRET_KEY;
  const valid = "a".repeat(64);

  beforeEach(() => { delete process.env.ONBOARDING_SECRET_KEY; });
  afterEach(() => {
    if (original === undefined) delete process.env.ONBOARDING_SECRET_KEY;
    else process.env.ONBOARDING_SECRET_KEY = original;
  });

  it("is unavailable when the key is missing", () => {
    expect(secureFieldsAvailable()).toBe(false);
  });

  it("is available with 64 hex characters", () => {
    process.env.ONBOARDING_SECRET_KEY = valid;
    expect(secureFieldsAvailable()).toBe(true);
    process.env.ONBOARDING_SECRET_KEY = "ABCDEF" + "0".repeat(58); // case-insensitive
    expect(secureFieldsAvailable()).toBe(true);
  });

  it("rejects a key that is the wrong length or not hex", () => {
    // A too-short key would throw deep inside createCipheriv at submit time —
    // i.e. in front of the customer. Reject it up front instead.
    for (const bad of ["a".repeat(63), "a".repeat(65), "z".repeat(64), "not-a-key", ""]) {
      process.env.ONBOARDING_SECRET_KEY = bad;
      expect(secureFieldsAvailable(), `should reject ${JSON.stringify(bad.slice(0, 12))}`).toBe(false);
    }
  });

  it("tolerates surrounding whitespace, which pasting adds", () => {
    process.env.ONBOARDING_SECRET_KEY = `  ${valid}\n`;
    expect(secureFieldsAvailable()).toBe(true);
  });
});
