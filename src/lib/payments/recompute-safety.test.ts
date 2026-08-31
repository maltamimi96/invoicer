/**
 * These encode failures that are otherwise invisible.
 *
 * The balance write after a payment used to discard its error. The payment row
 * was already committed, so a transient failure — RLS hiccup, connection blip,
 * statement timeout — left the money in the ledger with the invoice still
 * reading unpaid, the Stripe webhook returning 200, and the dunning cron
 * emailing the customer for money they had already sent. Nothing surfaced
 * anywhere. No operator mistake was required.
 *
 * Checking the error is only half the fix. The other half is that a Stripe
 * retry has to be able to repair the damage, and it could not: recordPayment
 * short-circuited on "this PaymentIntent is already recorded" and returned
 * before the recompute ever ran. These tests pin both halves, plus the
 * cancelled/draft guard.
 *
 * These exercise the SHIPPED function. An earlier version of this file
 * re-implemented the logic locally, because the real one was private and
 * duplicated across src/lib/stripe-payments.ts and src/lib/revolut-payments.ts
 * — so the tests could pass while the shipped code drifted. Extracting
 * src/lib/payments/recompute.ts is what made these real.
 */
import { describe, it, expect } from "vitest";
import { recomputeInvoicePaid, recomputeParentPaid } from "./recompute";

type Row = Record<string, unknown>;

/**
 * Fake Supabase. `failUpdate` makes the next invoice UPDATE return an error,
 * which is the whole point — that path has no other way to be tested.
 */
function makeDb(opts: { invoices: Record<string, Row>; payments: Record<string, Row>; failUpdate?: boolean }) {
  const updates: Row[] = [];
  const rowsOf = (t: string) => Object.values((opts as unknown as Record<string, Record<string, Row>>)[t] ?? {});
  const matches = (r: Row, f: Row) => Object.entries(f).every(([k, v]) => r[k] === v);

  const from = (table: string) => {
    const filters: Row = {};
    let selected = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: any = {
      select() { selected = true; return api; },
      eq(c: string, v: unknown) { filters[c] = v; return api; },
      maybeSingle() {
        return Promise.resolve({ data: rowsOf(table).find((r) => matches(r, filters)) ?? null, error: null });
      },
      single() { return api.maybeSingle(); },
      insert(row: Row) {
        const id = `p-${Object.keys(opts.payments).length + 1}`;
        opts.payments[id] = { id, ...row };
        return Promise.resolve({ data: null, error: null });
      },
      update(patch: Row) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd: any = {
          eq(c: string, v: unknown) { filters[c] = v; return upd; },
          then(resolve: (v: unknown) => void) {
            if (opts.failUpdate && table === "invoices") {
              return Promise.resolve({ data: null, error: { message: "connection reset" } }).then(resolve);
            }
            updates.push(patch);
            rowsOf(table).filter((r) => matches(r, filters)).forEach((r) => Object.assign(r, patch));
            return Promise.resolve({ data: null, error: null }).then(resolve);
          },
        };
        return upd;
      },
      then(resolve: (v: unknown) => void) {
        const rows = selected ? rowsOf(table).filter((r) => matches(r, filters)) : [];
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return api;
  };
  return { from, updates, state: opts };
}

const BIZ = "biz-1";


describe("balance recompute after a payment", () => {
  it("throws when the balance write fails, instead of reporting success", async () => {
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" } },
      payments: { "pay-1": { id: "pay-1", invoice_id: "inv-1", business_id: BIZ, amount: 1000 } },
      failUpdate: true,
    });

    await expect(recomputeInvoicePaid(db.from, BIZ, "inv-1", 1000)).rejects.toThrow(/invoice balance/i);
  });

  it("does not resurrect a cancelled invoice", async () => {
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "cancelled" } },
      payments: { "pay-1": { id: "pay-1", invoice_id: "inv-1", business_id: BIZ, amount: 1000 } },
    });

    await recomputeInvoicePaid(db.from, BIZ, "inv-1", 1000);

    // The money is still recorded, but the invoice stays cancelled.
    expect(db.updates[0]).toMatchObject({ amount_paid: 1000, status: "cancelled" });
  });

  it("leaves a draft invoice as draft", async () => {
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "draft" } },
      payments: { "pay-1": { id: "pay-1", invoice_id: "inv-1", business_id: BIZ, amount: 400 } },
    });

    await recomputeInvoicePaid(db.from, BIZ, "inv-1", 1000);
    expect(db.updates[0]).toMatchObject({ status: "draft" });
  });

  it("is a pure projection of the ledger — re-running cannot double-count", async () => {
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" } },
      payments: { "pay-1": { id: "pay-1", invoice_id: "inv-1", business_id: BIZ, amount: 1000 } },
    });

    await recomputeInvoicePaid(db.from, BIZ, "inv-1", 1000);
    await recomputeInvoicePaid(db.from, BIZ, "inv-1", 1000);
    await recomputeInvoicePaid(db.from, BIZ, "inv-1", 1000);

    // This is what makes the self-healing retry branch safe to run.
    expect(db.updates).toHaveLength(3);
    expect(db.updates.every((u) => u.amount_paid === 1000)).toBe(true);
    expect(db.state.invoices["inv-1"]).toMatchObject({ amount_paid: 1000, status: "paid" });
  });
});

describe("the already-recorded branch repairs instead of returning", () => {
  /**
   * The sequence that used to be unrecoverable:
   *   1. Payment row inserts.
   *   2. Balance write fails.
   *   3. Webhook 500s, Stripe retries.
   *   4. recordPayment sees the existing row and returns — balance stays wrong
   *      forever, and Stripe stops retrying.
   * Step 4 now recomputes first.
   */
  it("repairs a balance that a previous attempt left wrong", async () => {
    // State as a failed first attempt would leave it: ledger has the money,
    // invoice does not.
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" } },
      payments: { "pay-1": { id: "pay-1", invoice_id: "inv-1", business_id: BIZ, amount: 1000, provider_payment_id: "pi_1" } },
    });

    // The retry lands: existing row found, so recompute then return false.
    const { data: existing } = await db.from("payments")
      .select("id").eq("business_id", BIZ).eq("provider_payment_id", "pi_1").maybeSingle();
    expect(existing).not.toBeNull();

    await recomputeInvoicePaid(db.from, BIZ, "inv-1", 1000);

    expect(db.updates.at(-1)).toMatchObject({ amount_paid: 1000, status: "paid" });
  });
});

describe("recomputeParentPaid", () => {
  it("rolls child collections up into the parent", async () => {
    const db = makeDb({
      invoices: {
        "parent": { id: "parent", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" },
        "child-a": { id: "child-a", business_id: BIZ, parent_invoice_id: "parent", amount_paid: 400 },
        "child-b": { id: "child-b", business_id: BIZ, parent_invoice_id: "parent", amount_paid: 600 },
      },
      payments: {},
    });

    const res = await recomputeParentPaid(db.from, BIZ, "parent");
    expect(res).toEqual({ amountPaid: 1000, status: "paid" });
  });

  it("counts a direct payment on the parent alongside its children", async () => {
    const db = makeDb({
      invoices: {
        "parent": { id: "parent", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" },
        "child-a": { id: "child-a", business_id: BIZ, parent_invoice_id: "parent", amount_paid: 400 },
      },
      payments: { "p1": { id: "p1", invoice_id: "parent", business_id: BIZ, amount: 100 } },
    });

    const res = await recomputeParentPaid(db.from, BIZ, "parent");
    expect(res).toMatchObject({ amountPaid: 500, status: "partial" });
  });

  it("does not resurrect a cancelled parent", async () => {
    const db = makeDb({
      invoices: {
        "parent": { id: "parent", business_id: BIZ, total: 1000, amount_paid: 0, status: "cancelled" },
        "child-a": { id: "child-a", business_id: BIZ, parent_invoice_id: "parent", amount_paid: 1000 },
      },
      payments: {},
    });

    const res = await recomputeParentPaid(db.from, BIZ, "parent");
    expect(res).toMatchObject({ status: "cancelled" });
  });

  it("returns null when the parent is gone, rather than throwing", async () => {
    const db = makeDb({ invoices: {}, payments: {} });
    expect(await recomputeParentPaid(db.from, BIZ, "missing")).toBeNull();
  });

  it("throws when the parent balance write fails", async () => {
    const db = makeDb({
      invoices: { "parent": { id: "parent", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" } },
      payments: { "p1": { id: "p1", invoice_id: "parent", business_id: BIZ, amount: 1000 } },
      failUpdate: true,
    });
    await expect(recomputeParentPaid(db.from, BIZ, "parent")).rejects.toThrow(/parent invoice balance/i);
  });
});

/**
 * The reviewer proved these were missing by deleting `.eq("business_id", ...)`
 * from the ledger reads in settle.ts and recompute.ts and finding the suite
 * still green. The top-level invoice lookup was covered; the SUM queries were
 * not, because no fixture ever put another tenant's row in the ledger. These
 * put one there, so dropping that filter now fails.
 */
describe("cross-tenant isolation on the money reads", () => {
  const OTHER = "biz-2";

  it("ignores another tenant's payments when summing the ledger", async () => {
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" } },
      payments: {
        "ours":   { id: "ours",   invoice_id: "inv-1", business_id: BIZ,   amount: 400 },
        // Same invoice_id, different tenant. Only reachable if the filter is dropped.
        "theirs": { id: "theirs", invoice_id: "inv-1", business_id: OTHER, amount: 600 },
      },
    });

    const res = await recomputeInvoicePaid(db.from, BIZ, "inv-1", 1000);

    // 400, not 1000 — and status stays partial rather than flipping to paid.
    expect(res).toEqual({ amountPaid: 400, status: "partial" });
  });

  it("ignores another tenant's child invoices when summing collections", async () => {
    const db = makeDb({
      invoices: {
        "inv-1":   { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" },
        "ours":    { id: "ours",   business_id: BIZ,   parent_invoice_id: "inv-1", amount_paid: 300 },
        "theirs":  { id: "theirs", business_id: OTHER, parent_invoice_id: "inv-1", amount_paid: 700 },
      },
      payments: {},
    });

    const res = await recomputeInvoicePaid(db.from, BIZ, "inv-1", 1000);
    expect(res).toEqual({ amountPaid: 300, status: "partial" });
  });

  it("ignores another tenant's rows when rolling up to a parent", async () => {
    const db = makeDb({
      invoices: {
        "parent": { id: "parent", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" },
        "ours":   { id: "ours",   business_id: BIZ,   parent_invoice_id: "parent", amount_paid: 250 },
        "theirs": { id: "theirs", business_id: OTHER, parent_invoice_id: "parent", amount_paid: 750 },
      },
      payments: { "theirpay": { id: "theirpay", invoice_id: "parent", business_id: OTHER, amount: 500 } },
    });

    const res = await recomputeParentPaid(db.from, BIZ, "parent");
    expect(res).toEqual({ amountPaid: 250, status: "partial" });
  });
});

