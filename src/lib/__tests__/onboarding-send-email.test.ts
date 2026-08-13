/**
 * The address check in front of an onboarding send.
 *
 * A real customer row carried `info@crownroofers.com,au` — a comma typed for
 * the second dot. The provider rejected it, sendEmail threw out of the server
 * action, Next masked the message in production, and the request row had
 * already been created — so the Send button looked like it did nothing while
 * leaving a pending request behind.
 *
 * The regex in lib/onboarding/validate.ts would NOT have caught it: its domain
 * part is `[^\s@]+`, which permits commas. These cases pin the difference.
 */
import { describe, it, expect } from "vitest";

// Mirrors looksLikeEmail in lib/onboarding/send.ts, which is module-private.
const looksLikeEmail = (v: string) =>
  /^[^\s@,;]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(v.trim());

// The permissive one this replaced, kept to demonstrate the gap.
const LOOSE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

describe("onboarding send address check", () => {
  it("rejects the comma-for-dot typo that caused the silent failure", () => {
    expect(looksLikeEmail("info@crownroofers.com,au")).toBe(false);
    // And confirm the loose regex really would have let it through, so this
    // test is guarding a difference that actually exists.
    expect(LOOSE.test("info@crownroofers.com,au")).toBe(true);
  });

  it("accepts the address that was meant", () => {
    expect(looksLikeEmail("info@crownroofers.com.au")).toBe(true);
  });

  it("accepts ordinary addresses", () => {
    for (const ok of [
      "m.altamimi96@outlook.com",
      "sarah+onboarding@harbour-strata.com.au",
      "a@b.co",
    ]) expect(looksLikeEmail(ok)).toBe(true);
  });

  it("rejects the other ways a pasted address goes wrong", () => {
    for (const bad of [
      "",                       // empty
      "no-at-sign.com",         // missing @
      "two@@at.com",            // doubled @
      "trailing@dot.com.",      // trailing dot
      "spaced @domain.com",     // space in the local part
      "user@domain",            // no TLD
      "user@domain.c",          // one-letter TLD
      "a@b.com;c@d.com",        // two addresses in one field
    ]) expect(looksLikeEmail(bad)).toBe(false);
  });

  it("tolerates surrounding whitespace", () => {
    expect(looksLikeEmail("  info@crownroofers.com.au  ")).toBe(true);
  });
});
