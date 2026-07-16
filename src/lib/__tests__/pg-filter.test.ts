import { describe, it, expect } from "vitest";
import { ilikeAcross } from "../pg-filter";

const COLS = ["name", "email", "company"];

describe("ilikeAcross", () => {
  it("quotes the term so a comma cannot split the filter", () => {
    // The bug: `Smith, John` used to render as
    //   name.ilike.%Smith, John%,email.ilike....
    // which PostgREST reads as a condition `name.ilike.%Smith` followed by a
    // broken one starting ` John%` -> 400 -> callers saw "no matches".
    const filter = ilikeAcross(COLS, "Smith, John");
    expect(filter).toBe(
      'name.ilike."%Smith, John%",email.ilike."%Smith, John%",company.ilike."%Smith, John%"'
    );
  });

  it("keeps dots and parens literal", () => {
    const filter = ilikeAcross(["name"], "Acme Ltd. (UK)");
    expect(filter).toBe('name.ilike."%Acme Ltd. (UK)%"');
  });

  it("escapes double quotes so they cannot close the quoted value", () => {
    expect(ilikeAcross(["name"], 'The "Big" Co')).toBe(
      'name.ilike."%The \\"Big\\" Co%"'
    );
  });

  it("escapes backslashes before quotes so an escape cannot be smuggled in", () => {
    // A trailing backslash must not escape our own closing quote.
    expect(ilikeAcross(["name"], "back\\slash")).toBe(
      'name.ilike."%back\\\\slash%"'
    );
  });

  it("keeps the % wildcards outside the escaped term", () => {
    expect(ilikeAcross(["name"], "acme")).toBe('name.ilike."%acme%"');
  });

  it("handles an empty term without producing a malformed filter", () => {
    expect(ilikeAcross(["name"], "")).toBe('name.ilike."%%"');
  });
});
