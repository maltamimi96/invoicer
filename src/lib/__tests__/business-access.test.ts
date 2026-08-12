/**
 * The gate that stands between a cookie and the service-role client.
 *
 * getActiveBizId trusts the active_business_id cookie, which is safe wherever
 * RLS re-checks the query. On the assistant route it isn't: the tools run as
 * service-role. userBelongsToBusiness is what makes the cookie trustworthy
 * there, so its failure modes are worth pinning down.
 */
import { describe, it, expect } from "vitest";
import { userBelongsToBusiness } from "@/lib/active-business";

type Row = { data: unknown; error: unknown };

/**
 * Minimal stand-in for the PostgREST builder chain: every filter returns this,
 * and maybeSingle() resolves whatever the table was seeded with.
 */
function fakeClient(tables: Record<string, Row>) {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) chain[m] = () => chain;
    chain.maybeSingle = async () => tables[table] ?? { data: null, error: null };
    return chain;
  };
  return { from: (table: string) => builder(table) };
}

const OWNED = { data: { id: "biz-1" }, error: null };
const NOT_FOUND = { data: null, error: null };
const MEMBER = { data: { business_id: "biz-1" }, error: null };

describe("userBelongsToBusiness", () => {
  it("accepts the owner", async () => {
    const sb = fakeClient({ businesses: OWNED, business_members: NOT_FOUND });
    expect(await userBelongsToBusiness(sb, "user-1", "biz-1")).toBe(true);
  });

  it("accepts an active member who is not the owner", async () => {
    const sb = fakeClient({ businesses: NOT_FOUND, business_members: MEMBER });
    expect(await userBelongsToBusiness(sb, "user-1", "biz-1")).toBe(true);
  });

  it("rejects a stranger — the cross-tenant case", async () => {
    // What a forged active_business_id cookie looks like: RLS returns nothing
    // for both lookups, and that has to be a refusal rather than a shrug.
    const sb = fakeClient({ businesses: NOT_FOUND, business_members: NOT_FOUND });
    expect(await userBelongsToBusiness(sb, "attacker", "someone-elses-biz")).toBe(false);
  });

  it("fails closed when a lookup errors", async () => {
    // A transient error must not read as "no objection".
    const boom = { data: null, error: { message: "connection reset" } };
    expect(await userBelongsToBusiness(fakeClient({ businesses: boom, business_members: NOT_FOUND }), "u", "b"))
      .toBe(false);
    expect(await userBelongsToBusiness(fakeClient({ businesses: NOT_FOUND, business_members: boom }), "u", "b"))
      .toBe(false);
  });

  it("fails closed even when the other lookup would have said yes", async () => {
    // Belt and braces: an error anywhere means we don't know, and not knowing
    // is a no. Otherwise an attacker who can induce one error gets a bypass.
    const boom = { data: null, error: { message: "timeout" } };
    expect(await userBelongsToBusiness(fakeClient({ businesses: OWNED, business_members: boom }), "u", "b"))
      .toBe(false);
  });
});
