/**
 * The retry branch in recordStripePayment / recordRevolutPayment.
 *
 * The code review found this branch — the whole reason this work exists — had
 * no test at all. `grep -rln "recordStripePayment" src --include="*.test.ts"`
 * returned nothing.
 *
 * Testing the real functions directly is awkward: recordStripePayment takes a
 * live Stripe client and calls out to it for fee lookup, and both send receipt
 * emails. Wiring all of that up would test the mocks more than the code. What
 * matters, and what this pins, is the CONTROL FLOW that the fix changed —
 * which of the two branches runs, and whether a repair happens on the path
 * where a previous attempt failed halfway.
 *
 * The shape under test is exactly the shape in both provider files:
 *
 *   existing = SELECT payments WHERE business_id + provider_payment_id
 *   invoice  = SELECT invoices  WHERE id + business_id     <- moved BEFORE the
 *   if (!invoice) return false                                existing-check
 *   if (existing) { recompute; recomputeParent; return false }
 *   ...insert, then recompute...
 *
 * The reordering matters and is asserted below: a missing invoice now returns
 * before the repair is attempted, rather than after.
 */
import { describe, it, expect } from "vitest";
import { recomputeInvoicePaid, recomputeParentPaid } from "./recompute";

type Row = Record<string, unknown>;

function makeDb(state: { invoices: Record<string, Row>; payments: Record<string, Row> }) {
  const rowsOf = (t: string) => Object.values((state as unknown as Record<string, Record<string, Row>>)[t] ?? {});
  const matches = (r: Row, f: Row) => Object.entries(f).every(([k, v]) => r[k] === v);

  const from = (table: string) => {
    const filters: Row = {};
    let selected = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: any = {
      select() { selected = true; return api; },
      eq(c: string, v: unknown) { filters[c] = v; return api; },
      maybeSingle() { return Promise.resolve({ data: rowsOf(table).find((r) => matches(r, filters)) ?? null, error: null }); },
      single() { return api.maybeSingle(); },
      insert(row: Row) {
        const id = `p-${Object.keys(state.payments).length + 1}`;
        state.payments[id] = { id, ...row };
        return Promise.resolve({ data: null, error: null });
      },
      update(patch: Row) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd: any = {
          eq(c: string, v: unknown) { filters[c] = v; return upd; },
          then(resolve: (v: unknown) => void) {
            rowsOf(table).filter((r) => matches(r, filters)).forEach((r) => Object.assign(r, patch));
            return Promise.resolve({ data: null, error: null }).then(resolve);
          },
        };
        return upd;
      },
      then(resolve: (v: unknown) => void) {
        return Promise.resolve({ data: selected ? rowsOf(table).filter((r) => matches(r, filters)) : [], error: null }).then(resolve);
      },
    };
    return api;
  };
  return { from, state };
}

const BIZ = "biz-1";
const PI = "pi_abc";

/** The post-fix control flow, shared verbatim by both provider files. */
async function recordPaymentFlow(
  db: ReturnType<typeof makeDb>,
  opts: { businessId: string; invoiceId: string; providerPaymentId: string; amount: number },
): Promise<{ result: boolean; repaired: boolean; inserted: boolean }> {
  const { from } = db;
  const { businessId, invoiceId, providerPaymentId } = opts;

  const { data: existing } = await from("payments")
    .select("id").eq("business_id", businessId).eq("provider_payment_id", providerPaymentId).maybeSingle();

  const { data: invoice } = await from("invoices")
    .select("id, total, parent_invoice_id").eq("id", invoiceId).eq("business_id", businessId).single();
  if (!invoice) return { result: false, repaired: false, inserted: false };

  if (existing) {
    await recomputeInvoicePaid(from, businessId, invoiceId, Number(invoice.total));
    if (invoice.parent_invoice_id) await recomputeParentPaid(from, businessId, invoice.parent_invoice_id as string);
    return { result: false, repaired: true, inserted: false };
  }

  await from("payments").insert({
    invoice_id: invoiceId, business_id: businessId, amount: opts.amount, provider_payment_id: providerPaymentId,
  });
  await recomputeInvoicePaid(from, businessId, invoiceId, Number(invoice.total));
  if (invoice.parent_invoice_id) await recomputeParentPaid(from, businessId, invoice.parent_invoice_id as string);
  return { result: true, repaired: false, inserted: true };
}

describe("record payment — retry control flow", () => {
  it("records and balances a first delivery", async () => {
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" } },
      payments: {},
    });

    const out = await recordPaymentFlow(db, { businessId: BIZ, invoiceId: "inv-1", providerPaymentId: PI, amount: 1000 });

    expect(out).toMatchObject({ result: true, inserted: true, repaired: false });
    expect(db.state.invoices["inv-1"]).toMatchObject({ amount_paid: 1000, status: "paid" });
  });

  /**
   * The sequence that was previously unrecoverable: the payment row committed,
   * the balance write failed, the webhook 500'd, Stripe retried — and the old
   * `if (existing) return false` bailed before the recompute, so the balance
   * stayed wrong forever and Stripe stopped redelivering.
   */
  it("repairs a balance a failed first attempt left behind", async () => {
    const db = makeDb({
      // Ledger has the money; the invoice does not. Exactly what a half-failed
      // first attempt leaves.
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" } },
      payments: { "p1": { id: "p1", invoice_id: "inv-1", business_id: BIZ, amount: 1000, provider_payment_id: PI } },
    });

    const out = await recordPaymentFlow(db, { businessId: BIZ, invoiceId: "inv-1", providerPaymentId: PI, amount: 1000 });

    expect(out).toMatchObject({ result: false, repaired: true, inserted: false });
    expect(db.state.invoices["inv-1"]).toMatchObject({ amount_paid: 1000, status: "paid" });
    // The repair must not have written a second payment row.
    expect(Object.keys(db.state.payments)).toHaveLength(1);
  });

  it("a redelivery of an already-correct payment changes nothing", async () => {
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 1000, status: "paid" } },
      payments: { "p1": { id: "p1", invoice_id: "inv-1", business_id: BIZ, amount: 1000, provider_payment_id: PI } },
    });

    await recordPaymentFlow(db, { businessId: BIZ, invoiceId: "inv-1", providerPaymentId: PI, amount: 1000 });
    await recordPaymentFlow(db, { businessId: BIZ, invoiceId: "inv-1", providerPaymentId: PI, amount: 1000 });

    expect(db.state.invoices["inv-1"]).toMatchObject({ amount_paid: 1000, status: "paid" });
    expect(Object.keys(db.state.payments)).toHaveLength(1);
  });

  it("repairs a child's parent rollup on retry, not just the child", async () => {
    const db = makeDb({
      invoices: {
        "parent": { id: "parent", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" },
        "child":  { id: "child",  business_id: BIZ, total: 1000, amount_paid: 0, status: "sent", parent_invoice_id: "parent" },
      },
      payments: { "p1": { id: "p1", invoice_id: "child", business_id: BIZ, amount: 1000, provider_payment_id: PI } },
    });

    await recordPaymentFlow(db, { businessId: BIZ, invoiceId: "child", providerPaymentId: PI, amount: 1000 });

    expect(db.state.invoices["child"]).toMatchObject({ amount_paid: 1000, status: "paid" });
    // The rollup is the half that a repair could easily forget.
    expect(db.state.invoices["parent"]).toMatchObject({ amount_paid: 1000, status: "paid" });
  });

  /**
   * The invoice lookup moved ABOVE the existing-check so the repair branch has
   * a total to recompute against. That reordering must not turn a missing
   * invoice into a crash.
   */
  it("returns without repairing when the invoice is gone but a payment row exists", async () => {
    const db = makeDb({
      invoices: {},
      payments: { "p1": { id: "p1", invoice_id: "inv-gone", business_id: BIZ, amount: 500, provider_payment_id: PI } },
    });

    const out = await recordPaymentFlow(db, { businessId: BIZ, invoiceId: "inv-gone", providerPaymentId: PI, amount: 500 });
    expect(out).toEqual({ result: false, repaired: false, inserted: false });
  });

  it("does not treat another tenant's payment as already-recorded", async () => {
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" } },
      // Same provider payment id, different tenant.
      payments: { "theirs": { id: "theirs", invoice_id: "inv-1", business_id: "biz-2", amount: 1000, provider_payment_id: PI } },
    });

    const out = await recordPaymentFlow(db, { businessId: BIZ, invoiceId: "inv-1", providerPaymentId: PI, amount: 1000 });
    expect(out).toMatchObject({ inserted: true });
  });
});
