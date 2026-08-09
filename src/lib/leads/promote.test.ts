import { describe, it, expect } from "vitest";
import { ensureContactForLead, markContactAsClient } from "./promote";

/**
 * A fake just rich enough for these two functions: chained filters collect
 * predicates, and the terminal call returns whatever the script queued.
 * Real Supabase behaviour that matters here — `.eq()` chains, maybeSingle
 * returning null, update().select() returning the affected rows — is what's
 * modelled; nothing else.
 */
function makeSb(state: {
  leads: Record<string, Record<string, unknown>>;
  customers: Record<string, Record<string, unknown>>;
}) {
  const calls: string[] = [];
  let nextId = 1;

  const builder = (table: string) => {
    const filters: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: any = {
      select() { return api; },
      eq(col: string, val: unknown) { filters[col] = val; return api; },
      ilike(col: string, val: unknown) { filters[col] = val; return api; },
      limit() { return api; },
      maybeSingle() {
        const rows = Object.values(state[table as "leads" | "customers"] ?? {});
        const hit = rows.find((r) => Object.entries(filters).every(([k, v]) =>
          k === "email"
            ? String(r[k] ?? "").toLowerCase() === String(v).toLowerCase()
            : r[k] === v));
        return Promise.resolve({ data: hit ?? null, error: null });
      },
      single() { return api.maybeSingle(); },
      insert(row: Record<string, unknown>) {
        const id = `new-${nextId++}`;
        state.customers[id] = { id, ...row };
        calls.push(`insert:${table}`);
        return {
          select: () => ({ single: () => Promise.resolve({ data: { id }, error: null }) }),
        };
      },
      update(patch: Record<string, unknown>) {
        calls.push(`update:${table}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inSets: Record<string, unknown[]> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd: any = {
          eq(col: string, val: unknown) { filters[col] = val; return upd; },
          in(col: string, vals: unknown[]) { inSets[col] = vals; return upd; },
          select() {
            const hits = match();
            hits.forEach((r) => Object.assign(r, patch));
            return Promise.resolve({ data: hits, error: null });
          },
          then(res: (v: unknown) => void) {
            match().forEach((r) => Object.assign(r, patch));
            return Promise.resolve({ data: null, error: null }).then(res);
          },
        };
        const match = () => {
          const store = state[table as "leads" | "customers"];
          return Object.values(store).filter((r) =>
            Object.entries(filters).every(([k, v]) => r[k] === v)
            && Object.entries(inSets).every(([k, vals]) => vals.includes(r[k])));
        };
        return upd;
      },
    };
    return api;
  };

  return { sb: { from: (t: string) => builder(t) }, calls };
}

const BIZ = "biz-1";

describe("ensureContactForLead", () => {
  it("creates a contact marked as a lead, not a client", async () => {
    const state = {
      leads: { L1: { id: "L1", business_id: BIZ, name: "Acme", email: "hi@acme.com", customer_id: null } },
      customers: {} as Record<string, Record<string, unknown>>,
    };
    const { sb } = makeSb(state);
    const res = await ensureContactForLead(sb, BIZ, "L1");

    expect(res.created).toBe(true);
    // The whole point: billable, but not yet counted as a client.
    expect(state.customers[res.customerId].lifecycle_stage).toBe("lead");
    // And linked, so a second quote can't fork them.
    expect(state.leads.L1.customer_id).toBe(res.customerId);
  });

  it("is idempotent — quoting twice does not create two contacts", async () => {
    const state = {
      leads: { L1: { id: "L1", business_id: BIZ, name: "Acme", email: "hi@acme.com", customer_id: "C9" } },
      customers: { C9: { id: "C9", business_id: BIZ, lifecycle_stage: "lead" } },
    };
    const { sb } = makeSb(state);
    const res = await ensureContactForLead(sb, BIZ, "L1");
    expect(res).toEqual({ customerId: "C9", created: false });
    expect(Object.keys(state.customers)).toHaveLength(1);
  });

  it("reuses an existing contact with the same email rather than forking them", async () => {
    // A lead captured from a form and a client typed in by hand are regularly
    // the same person; quoting the lead must not create a duplicate.
    const state = {
      leads: { L1: { id: "L1", business_id: BIZ, name: "Acme", email: "Hi@Acme.com", customer_id: null } },
      customers: { C1: { id: "C1", business_id: BIZ, email: "hi@acme.com", lifecycle_stage: "client" } },
    };
    const { sb } = makeSb(state);
    const res = await ensureContactForLead(sb, BIZ, "L1");
    expect(res).toEqual({ customerId: "C1", created: false });
    expect(Object.keys(state.customers)).toHaveLength(1);
  });

  it("refuses a lead that isn't there", async () => {
    const { sb } = makeSb({ leads: {}, customers: {} });
    await expect(ensureContactForLead(sb, BIZ, "nope")).rejects.toThrow(/not found/i);
  });
});

describe("markContactAsClient", () => {
  it("promotes a lead-stage contact when money arrives", async () => {
    const state = {
      leads: {},
      customers: { C1: { id: "C1", business_id: BIZ, lifecycle_stage: "lead" } },
    };
    const { sb } = makeSb(state);
    expect(await markContactAsClient(sb, BIZ, "C1")).toBe(true);
    expect(state.customers.C1.lifecycle_stage).toBe("client");
  });

  it("never demotes an existing client", async () => {
    // The update is filtered on lifecycle_stage='lead', so a client paying a
    // second invoice is a no-op rather than a rewrite.
    const state = {
      leads: {},
      customers: { C1: { id: "C1", business_id: BIZ, lifecycle_stage: "client" } },
    };
    const { sb } = makeSb(state);
    expect(await markContactAsClient(sb, BIZ, "C1")).toBe(false);
    expect(state.customers.C1.lifecycle_stage).toBe("client");
  });

  it("tolerates a missing customer id rather than throwing into a payment", async () => {
    const { sb } = makeSb({ leads: {}, customers: {} });
    expect(await markContactAsClient(sb, BIZ, null)).toBe(false);
    expect(await markContactAsClient(sb, BIZ, undefined)).toBe(false);
  });
});

describe("the pipeline follows the money", () => {
  it("marks the linked lead won when the contact becomes a client", async () => {
    // The drift this fixes: 11 leads were marked won, 10 of them with no
    // contact at all, because three different places wrote "became a customer".
    const state = {
      leads: { L1: { id: "L1", business_id: BIZ, customer_id: "C1", status: "quoted" } },
      customers: { C1: { id: "C1", business_id: BIZ, lifecycle_stage: "lead" } },
    };
    const { sb } = makeSb(state);
    await markContactAsClient(sb, BIZ, "C1");
    expect(state.customers.C1.lifecycle_stage).toBe("client");
    expect(state.leads.L1.status).toBe("won");
  });

  it("does not reopen a lead someone marked lost", async () => {
    const state = {
      leads: { L1: { id: "L1", business_id: BIZ, customer_id: "C1", status: "lost" } },
      customers: { C1: { id: "C1", business_id: BIZ, lifecycle_stage: "lead" } },
    };
    const { sb } = makeSb(state);
    await markContactAsClient(sb, BIZ, "C1");
    expect(state.leads.L1.status).toBe("lost");
  });

  it("moves a new lead to quoted when it is first billed", async () => {
    const state = {
      leads: { L1: { id: "L1", business_id: BIZ, name: "Acme", email: "a@b.c", customer_id: null, status: "new" } },
      customers: {} as Record<string, Record<string, unknown>>,
    };
    const { sb } = makeSb(state);
    await ensureContactForLead(sb, BIZ, "L1");
    expect(state.leads.L1.status).toBe("quoted");
    expect(state.leads.L1.customer_id).toBeTruthy();
  });

  it("still links the contact on a lead already marked won", async () => {
    // The status guard must not stop the LINK being written, or a won lead
    // would never get the contact row its invoice needs.
    const state = {
      leads: { L1: { id: "L1", business_id: BIZ, name: "Acme", email: "a@b.c", customer_id: null, status: "won" } },
      customers: {} as Record<string, Record<string, unknown>>,
    };
    const { sb } = makeSb(state);
    const res = await ensureContactForLead(sb, BIZ, "L1");
    expect(state.leads.L1.status).toBe("won");
    expect(state.leads.L1.customer_id).toBe(res.customerId);
  });
});
