/**
 * Phone normalisation for the lead → customer match.
 *
 * A lead that isn't already linked to a customer used to mint a new one
 * unconditionally, which is how one contact ended up with two records sharing
 * an email and a phone — her history on the first, a new quote on the second.
 * The match now runs on email, then phone.
 *
 * Phones are free text in this database, so the comparison has to survive the
 * ways people actually type them. It also has to be strict enough that two
 * different people never collapse into one record: a wrong merge is far worse
 * than the duplicate it prevents.
 */
import { describe, it, expect } from "vitest";

// Mirrors normalisePhone in lib/actions/leads.ts and lib/mcp/register-tools.ts.
const normalisePhone = (v: string | null | undefined) =>
  String(v ?? "").replace(/\D/g, "").replace(/^61/, "0");

describe("normalisePhone", () => {
  it("treats the formats one person's number gets typed in as equal", () => {
    const forms = ["0485542633", "0485 542 633", "+61 485 542 633", "(0485) 542-633", "0485-542-633"];
    const normalised = forms.map(normalisePhone);
    expect(new Set(normalised).size).toBe(1);
    expect(normalised[0]).toBe("0485542633");
  });

  it("keeps different numbers different", () => {
    expect(normalisePhone("0485542633")).not.toBe(normalisePhone("0485542634"));
    expect(normalisePhone("0400000000")).not.toBe(normalisePhone("0400000001"));
  });

  it("returns empty for junk, so the caller's length guard skips matching", () => {
    // Guarding on length >= 8 is what stops "n/a" or "-" matching each other
    // and merging two unrelated customers.
    for (const junk of ["", "n/a", "-", "  ", "tbc"]) {
      expect(normalisePhone(junk).length).toBeLessThan(8);
    }
  });

  it("does not fold a short extension into a real mobile", () => {
    expect(normalisePhone("1234")).not.toBe(normalisePhone("0485542633"));
    expect(normalisePhone("1234").length).toBeLessThan(8);
  });
});
