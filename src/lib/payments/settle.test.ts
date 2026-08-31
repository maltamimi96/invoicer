import { describe, it, expect } from "vitest";
import { settleInvoiceToPaid, MARKED_PAID_METHOD } from "./settle";

/**
 * A fake just rich enough for settleInvoiceToPaid: `.eq()` chains collect
 * predicates, terminal calls resolve against in-memory tables. Same shape as
 * src/lib/leads/promote.test.ts.
 *
 * Notably this models `await from(...).select().eq(...)` resolving to an array
 * (no .single()), which is how the two sum queries read.
 */
function makeDb(state: {
  invoices: Record<string, Record<string, unknown>>;
  payments: Record<string, Record<string, unknown>>;
}) {
  const inserted: Record<string, unknown>[] = [];
  let nextId = 1;
  /** Set a table name here to make its next write fail. */
  const failWrites = new Set<string>();

  const rowsOf = (table: string) => Object.values(state[table as "invoices" | "payments"] ?? {});
  const matches = (row: Record<string, unknown>, filters: Record<string, unknown>) =>
    Object.entries(filters).every(([k, v]) => row[k] === v);

  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let selected = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: any = {
      select() { selected = true; return api; },
      eq(col: string, val: unknown) { filters[col] = val; return api; },
      maybeSingle() {
        const hit = rowsOf(table).find((r) => matches(r, filters));
        return Promise.resolve({ data: hit ?? null, error: null });
      },
      single() { return api.maybeSingle(); },
      insert(row: Record<string, unknown>) {
        if (failWrites.has(table)) {
          return Promise.resolve({ data: null, error: { message: `simulated ${table} insert failure` } });
        }
        const id = `p-${nextId++}`;
        state.payments[id] = { id, ...row };
        inserted.push(row);
        return Promise.resolve({ data: null, error: null });
      },
      update(patch: Record<string, unknown>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd: any = {
          eq(col: string, val: unknown) { filters[col] = val; return upd; },
          then(resolve: (v: unknown) => void) {
            if (failWrites.has(`update:${table}`)) {
              return Promise.resolve({ data: null, error: { message: "simulated update failure" } }).then(resolve);
            }
            rowsOf(table).filter((r) => matches(r, filters)).forEach((r) => Object.assign(r, patch));
            return Promise.resolve({ data: null, error: null }).then(resolve);
          },
        };
        return upd;
      },
      // `await from(t).select().eq(...)` with no terminal call resolves to rows.
      then(resolve: (v: unknown) => void) {
        const rows = selected ? rowsOf(table).filter((r) => matches(r, filters)) : [];
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return api;
  };

  return { from, inserted, state, failWrites };
}

const BIZ = "biz-1";
const USER = "user-1";

function oneInvoice(over: Record<string, unknown> = {}) {
  return {
    invoices: {
      "inv-1": { id: "inv-1", business_id: BIZ, total: 10000, amount_paid: 0, status: "sent", ...over },
    },
    payments: {} as Record<string, Record<string, unknown>>,
  };
}

describe("settleInvoiceToPaid", () => {
  it("writes one balancing payment for the full total on a clean invoice", async () => {
    const db = makeDb(oneInvoice());
    const res = await settleInvoiceToPaid(db.from, { businessId: BIZ, invoiceId: "inv-1", userId: USER });

    expect(res).toEqual({ inserted: true, balancingAmount: 10000, amountPaid: 10000 });
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({
      invoice_id: "inv-1", business_id: BIZ, user_id: USER,
      amount: 10000, method: MARKED_PAID_METHOD,
    });
    expect(db.state.invoices["inv-1"]).toMatchObject({ amount_paid: 10000, status: "paid" });
  });

  it("is idempotent — marking paid twice inserts nothing the second time", async () => {
    const db = makeDb(oneInvoice());
    await settleInvoiceToPaid(db.from, { businessId: BIZ, invoiceId: "inv-1", userId: USER });
    const second = await settleInvoiceToPaid(db.from, { businessId: BIZ, invoiceId: "inv-1", userId: USER });

    expect(second).toEqual({ inserted: false, balancingAmount: 0, amountPaid: 10000 });
    expect(db.inserted).toHaveLength(1);
    expect(Object.keys(db.state.payments)).toHaveLength(1);
  });

  it("balances only the remainder on a partially paid invoice", async () => {
    const db = makeDb(oneInvoice());
    db.state.payments["existing"] = { id: "existing", invoice_id: "inv-1", business_id: BIZ, amount: 2500 };

    const res = await settleInvoiceToPaid(db.from, { businessId: BIZ, invoiceId: "inv-1", userId: USER });

    expect(res.balancingAmount).toBe(7500);
    expect(res.amountPaid).toBe(10000);
    expect(db.inserted[0]).toMatchObject({ amount: 7500 });
  });

  /**
   * The B5 regression. Before this change: mark paid (writes amount_paid=total,
   * no ledger row), then record a real payment — the recompute reads the ledger,
   * finds only that payment, and writes amount_paid=500/status=partial. A
   * settled invoice went back to outstanding and into the dunning queue.
   *
   * After: mark-paid leaves a balancing row, so a later recompute over the
   * ledger still totals the full amount.
   */
  it("survives a later payment — the ledger still sums to the total (B5)", async () => {
    const db = makeDb(oneInvoice());
    await settleInvoiceToPaid(db.from, { businessId: BIZ, invoiceId: "inv-1", userId: USER });

    // A real payment arrives afterwards and is recorded normally.
    db.state.payments["later"] = { id: "later", invoice_id: "inv-1", business_id: BIZ, amount: 500 };

    // Whatever recomputes from the ledger now sees the balancing row too.
    const ledgerSum = Object.values(db.state.payments)
      .filter((p) => p.invoice_id === "inv-1")
      .reduce((s, p) => s + Number(p.amount), 0);

    expect(ledgerSum).toBe(10500);
    expect(ledgerSum).toBeGreaterThanOrEqual(10000); // never un-pays
  });

  it("counts child collections so a parent is not double-balanced", async () => {
    const db = makeDb(oneInvoice());
    db.state.invoices["child-1"] = {
      id: "child-1", business_id: BIZ, parent_invoice_id: "inv-1", total: 4000, amount_paid: 4000, status: "paid",
    };

    const res = await settleInvoiceToPaid(db.from, { businessId: BIZ, invoiceId: "inv-1", userId: USER });

    // 10000 total, 4000 already collected by the child → balance 6000, not 10000.
    expect(res.balancingAmount).toBe(6000);
    expect(res.amountPaid).toBe(10000);
  });

  it("throws and does NOT mark paid when the balancing insert fails", async () => {
    const db = makeDb(oneInvoice());
    db.failWrites.add("payments");

    await expect(
      settleInvoiceToPaid(db.from, { businessId: BIZ, invoiceId: "inv-1", userId: USER }),
    ).rejects.toThrow(/balancing payment/i);

    // The whole point: no ledger row, so no "paid" either.
    expect(db.state.invoices["inv-1"]).toMatchObject({ status: "sent", amount_paid: 0 });
  });

  it("throws when the invoice does not exist", async () => {
    const db = makeDb(oneInvoice());
    await expect(
      settleInvoiceToPaid(db.from, { businessId: BIZ, invoiceId: "nope", userId: USER }),
    ).rejects.toThrow(/Invoice not found/);
  });

  it("scopes every read and write to the business", async () => {
    const db = makeDb(oneInvoice());
    // Same invoice id, different tenant — must not be reachable.
    await expect(
      settleInvoiceToPaid(db.from, { businessId: "other-biz", invoiceId: "inv-1", userId: USER }),
    ).rejects.toThrow(/Invoice not found/);
    expect(db.inserted).toHaveLength(0);
  });
});

/**
 * Boundary introduced by unifying settle's 0.005 epsilon onto recompute's
 * PAID_TOLERANCE (0.01), found by code review of that very change.
 *
 * A residual balance in (0.005, 0.01] no longer gets a balancing row, so an
 * invoice can be marked paid with amount_paid up to one cent short of total.
 * That is deliberate and coherent — recomputeInvoicePaid uses the same
 * tolerance to call it paid, so the two agree — but it is a real edge and it
 * should be pinned rather than rediscovered.
 */
describe("the sub-cent boundary", () => {
  it("writes no balancing row for a residue inside the tolerance", async () => {
    const db = makeDb(oneInvoice({ total: 1000 }));
    db.state.payments["most"] = { id: "most", invoice_id: "inv-1", business_id: BIZ, amount: 999.995 };

    const res = await settleInvoiceToPaid(db.from, { businessId: BIZ, invoiceId: "inv-1", userId: USER });

    expect(res.inserted).toBe(false);
    // Marked paid, a fraction of a cent short. Consistent with what the
    // recompute would independently conclude.
    expect(db.state.invoices["inv-1"]).toMatchObject({ status: "paid" });
    expect(Number(db.state.invoices["inv-1"].amount_paid)).toBeCloseTo(999.995, 3);
  });

  it("still writes a row for a residue just outside the tolerance", async () => {
    const db = makeDb(oneInvoice({ total: 1000 }));
    db.state.payments["most"] = { id: "most", invoice_id: "inv-1", business_id: BIZ, amount: 999.98 };

    const res = await settleInvoiceToPaid(db.from, { businessId: BIZ, invoiceId: "inv-1", userId: USER });

    expect(res.inserted).toBe(true);
    expect(res.balancingAmount).toBeCloseTo(0.02, 2);
  });

  /**
   * Flagged in round 1 and deliberately not "fixed": when children have
   * collected more than the parent's total, the true collected amount is
   * written rather than clamped to total. Clamping would hide money.
   */
  it("records an overpayment truthfully instead of clamping it to total", async () => {
    const db = makeDb(oneInvoice({ total: 1000 }));
    db.state.invoices["child"] = {
      id: "child", business_id: BIZ, parent_invoice_id: "inv-1", amount_paid: 1200,
    };

    const res = await settleInvoiceToPaid(db.from, { businessId: BIZ, invoiceId: "inv-1", userId: USER });

    expect(res.inserted).toBe(false);          // nothing owed — they overpaid
    expect(res.amountPaid).toBe(1200);          // and the overpayment is visible
    expect(res.amountPaid).toBeGreaterThan(1000);
  });
});

