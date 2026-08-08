import { describe, it, expect } from "vitest";
import {
  validateVaultItem, normaliseUrl, passwordStrength, generatePassword, categoryLabel,
} from "./items";
import { assistantScopesForRole } from "@/lib/assistant/scopes";

describe("validateVaultItem", () => {
  it("requires a name", () => {
    expect(validateVaultItem({ title: "  ", password: "x" }, { isNew: true })).toMatch(/name/i);
  });

  it("rejects a new entry with nothing secret in it", () => {
    expect(validateVaultItem({ title: "Acme" }, { isNew: true })).toMatch(/password or some secure notes/i);
  });

  it("accepts notes with no password", () => {
    expect(validateVaultItem({ title: "Acme", notes: "recovery: 1234" }, { isNew: true })).toBeNull();
  });

  it("allows a blank password on EDIT — that means 'keep the stored one'", () => {
    // The form can't prefill a password it was never given, so requiring one
    // on every edit would make renaming an entry impossible without retyping
    // the secret.
    expect(validateVaultItem({ title: "Acme" }, { isNew: false })).toBeNull();
  });
});

describe("normaliseUrl", () => {
  it("adds a scheme so the Open link actually opens", () => {
    expect(normaliseUrl("business.facebook.com")).toBe("https://business.facebook.com");
    expect(normaliseUrl("https://x.com")).toBe("https://x.com");
    expect(normaliseUrl("  ")).toBeNull();
    expect(normaliseUrl(null)).toBeNull();
  });
});

describe("passwordStrength", () => {
  it("rates length above everything else", () => {
    expect(passwordStrength("aB3!").score).toBeLessThan(passwordStrength("aB3!aB3!aB3!aB3!").score);
  });

  it("caps obvious patterns however long they are", () => {
    expect(passwordStrength("aaaaaaaaaaaaaaaaaaaa").score).toBeLessThanOrEqual(1);
    expect(passwordStrength("password123456789").score).toBeLessThanOrEqual(1);
  });

  it("never returns a hint once it's strong", () => {
    expect(passwordStrength("Tr0ub4dor&3xample!!").hint).toBeNull();
  });
});

describe("generatePassword", () => {
  it("respects the requested length within bounds", () => {
    expect(generatePassword(20)).toHaveLength(20);
    expect(generatePassword(4)).toHaveLength(8);    // floor
    expect(generatePassword(999)).toHaveLength(64); // ceiling
  });

  it("omits characters that can't be read down a phone", () => {
    // These get transcribed by a human into someone else's login screen.
    for (let i = 0; i < 40; i++) {
      expect(generatePassword(40)).not.toMatch(/[lIO01]/);
    }
  });

  it("always contains every character class", () => {
    for (let i = 0; i < 40; i++) {
      const pw = generatePassword(12);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[2-9]/);
      expect(pw).toMatch(/[!@#$%^&*\-_=+?]/);
    }
  });

  it("doesn't repeat itself", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generatePassword(16)));
    expect(seen.size).toBe(50);
  });
});

describe("categoryLabel", () => {
  it("falls back rather than rendering a raw value", () => {
    expect(categoryLabel("social")).toBe("Social / ads account");
    expect(categoryLabel("something-new")).toBe("Other");
  });
});

/**
 * The security boundary that a future scope addition would silently breach.
 * READ_SCOPES/WRITE_SCOPES are derived from ALL_API_SCOPES, so without the
 * explicit exclusion an editor or viewer would inherit vault access the
 * database denies them.
 */
describe("vault scopes are never auto-granted to the assistant", () => {
  it("keeps editors and viewers out of the vault", () => {
    for (const role of ["editor", "viewer"] as const) {
      const scopes = assistantScopesForRole(role) ?? [];
      expect(scopes).not.toContain("vault:read");
      expect(scopes).not.toContain("vault:write");
    }
  });

  it("still denies workers everything", () => {
    expect(assistantScopesForRole("worker")).toBeNull();
  });
});
