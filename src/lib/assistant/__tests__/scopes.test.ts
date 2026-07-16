import { describe, it, expect } from "vitest";
import { assistantScopesForRole } from "../scopes";
import { expandApiScopes } from "@/types/database";

/**
 * This is a security boundary, not a preference.
 *
 * The assistant's tools run as service-role and bypass RLS entirely, so this
 * function — not the database — decides what a caller can reach. These tests
 * exist so a future refactor can't quietly widen it.
 */
describe("assistantScopesForRole", () => {
  it("denies workers outright", () => {
    // Worker isolation is enforced in the DB by is_business_worker() /
    // my_member_profile_ids() — precisely the layer the admin client steps
    // around. Granting a worker any scope here would expose every customer and
    // invoice in the business.
    expect(assistantScopesForRole("worker")).toBeNull();
  });

  it("distinguishes denial from granting nothing", () => {
    // null (denied) and [] (allowed, no scopes) must not be conflated: a
    // truthiness check on [] would silently let a denied role through.
    expect(assistantScopesForRole("worker")).toBeNull();
    expect(assistantScopesForRole("viewer")).not.toBeNull();
  });

  it("gives owners and admins the full surface", () => {
    for (const role of ["owner", "admin"] as const) {
      const scopes = assistantScopesForRole(role);
      expect(scopes).toEqual(["admin"]);
      // The wildcard must actually expand, or tools would fail scope checks.
      expect(expandApiScopes(scopes!).length).toBeGreaterThan(20);
    }
  });

  it("lets editors write but not change business settings", () => {
    const scopes = assistantScopesForRole("editor")!;
    expect(scopes).toContain("customers:write");
    expect(scopes).toContain("invoices:write");
    expect(scopes).not.toContain("settings:write");
    expect(scopes).not.toContain("admin");
  });

  it("keeps viewers read-only", () => {
    const scopes = assistantScopesForRole("viewer")!;
    expect(scopes).toContain("customers:read");
    expect(scopes).not.toContain("admin");
    // Not a single write scope may leak in.
    expect(scopes.filter((s) => s.endsWith(":write"))).toEqual([]);
  });

  it("never grants a write scope to a non-writing role", () => {
    for (const role of ["viewer", "worker"] as const) {
      const scopes = assistantScopesForRole(role) ?? [];
      expect(scopes.some((s) => s.endsWith(":write") || s === "admin")).toBe(false);
    }
  });
});
