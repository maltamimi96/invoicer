/**
 * Tests the REAL recordRevolutPayment, not a reproduction of its control flow.
 *
 * The retry-flow tests in src/lib/payments/record-payment-retry.test.ts model
 * the shape both providers share, and the code review was right that modelling
 * is not the same as testing. The stated justification — that these functions
 * need a live Stripe client — is true of recordStripePayment and false of this
 * one: it imports only dispatchWebhook and the two recomputes, and reaches the
 * receipt email through dynamic imports that never run when the customer has no
 * email address. So it can be tested directly, and is.
 *
 * Covered here and nowhere else: the 23505 unique-violation branch, which the
 * review asked for twice.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/webhooks", () => ({ dispatchWebhook: vi.fn() }));

import { recordRevolutPayment } from "./revolut-payments";
import { dispatchWebhook } from "@/lib/webhooks";

type Row = Record<string, unknown>;

/**
 * `insertError` scripts the payments insert to fail — the only way to reach the
 * 23505 branch and the throw-on-other-errors branch.
 */
function makeSb(state: {
  invoices: Record<string, Row>;
  payments: Record<string, Row>;
  customers?: Record<string, Row>;
  businesses?: Record<string, Row>;
  insertError?: { code?: string; message: string } | null;
}) {
  const inserted: Row[] = [];
  const tables = () => ({
    invoices: state.invoices,
    payments: state.payments,
    customers: state.customers ?? {},
    businesses: state.businesses ?? {},
  });
  const rowsOf = (t: string) => Object.values(tables()[t as keyof ReturnType<typeof tables>] ?? {});
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
        if (table === "payments" && state.insertError) {
          return Promise.resolve({ data: null, error: state.insertError });
        }
        const id = `p-${Object.keys(state.payments).length + 1}`;
        state.payments[id] = { id, ...row };
        inserted.push(row);
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
  return { from, inserted, state };
}

const BIZ = "biz-1";
const ORDER = "rev_order_1";

type SbState = {
  invoices: Record<string, Row>;
  payments: Record<string, Row>;
  customers: Record<string, Row>;
  businesses: Record<string, Row>;
  insertError?: { code?: string; message: string } | null;
};

/** Customer deliberately has no email, so the receipt path returns before its dynamic imports. */
function baseState(over: Partial<Row> = {}): SbState {
  return {
    invoices: {
      "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent", user_id: "u1", customer_id: "c1", number: "INV-1", ...over },
    },
    payments: {} as Record<string, Row>,
    customers: { "c1": { id: "c1", name: "Nobody", email: null } },
    businesses: { [BIZ]: { id: BIZ, name: "Biz", email: null, currency: "GBP" } },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("recordRevolutPayment", () => {
  it("records a first payment and balances the invoice", async () => {
    const sb = makeSb(baseState());

    const wrote = await recordRevolutPayment(sb, { businessId: BIZ, invoiceId: "inv-1", orderId: ORDER, amount: 1000 });

    expect(wrote).toBe(true);
    expect(sb.inserted[0]).toMatchObject({ provider: "revolut", provider_payment_id: ORDER, amount: 1000 });
    expect(sb.state.invoices["inv-1"]).toMatchObject({ amount_paid: 1000, status: "paid" });
    expect(dispatchWebhook).toHaveBeenCalledWith(BIZ, "payment.received", expect.objectContaining({ revolut_order_id: ORDER }));
  });

  /**
   * The branch this whole change exists for. A previous attempt wrote the
   * payment row then failed on the balance write; the redelivery must repair
   * rather than return.
   */
  it("repairs a balance left wrong by a half-failed first attempt", async () => {
    const st = baseState();
    st.payments["p1"] = { id: "p1", invoice_id: "inv-1", business_id: BIZ, amount: 1000, provider_payment_id: ORDER };
    const sb = makeSb(st);

    const wrote = await recordRevolutPayment(sb, { businessId: BIZ, invoiceId: "inv-1", orderId: ORDER, amount: 1000 });

    expect(wrote).toBe(false);              // nothing new written
    expect(sb.inserted).toHaveLength(0);    // and no duplicate row
    expect(sb.state.invoices["inv-1"]).toMatchObject({ amount_paid: 1000, status: "paid" }); // but repaired
  });

  it("repairs the parent rollup on redelivery too, not just the child", async () => {
    const st = baseState();
    st.invoices["parent"] = { id: "parent", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" };
    st.invoices["inv-1"].parent_invoice_id = "parent";
    st.payments["p1"] = { id: "p1", invoice_id: "inv-1", business_id: BIZ, amount: 1000, provider_payment_id: ORDER };
    const sb = makeSb(st);

    await recordRevolutPayment(sb, { businessId: BIZ, invoiceId: "inv-1", orderId: ORDER, amount: 1000 });

    expect(sb.state.invoices["parent"]).toMatchObject({ amount_paid: 1000, status: "paid" });
  });

  /**
   * 23505 is the unique index on (business_id, provider_payment_id) firing —
   * a webhook and an inline record racing. It must be swallowed as "already
   * recorded", not thrown. The review asked for this twice.
   */
  it("treats a 23505 unique violation as already-recorded, not an error", async () => {
    const st = baseState();
    st.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
    const sb = makeSb(st);

    const wrote = await recordRevolutPayment(sb, { businessId: BIZ, invoiceId: "inv-1", orderId: ORDER, amount: 1000 });

    expect(wrote).toBe(false);
    expect(dispatchWebhook).not.toHaveBeenCalled(); // no second "payment received"
  });

  it("throws on any other insert error rather than reporting success", async () => {
    const st = baseState();
    st.insertError = { code: "42501", message: "permission denied" };
    const sb = makeSb(st);

    await expect(
      recordRevolutPayment(sb, { businessId: BIZ, invoiceId: "inv-1", orderId: ORDER, amount: 1000 }),
    ).rejects.toMatchObject({ code: "42501" });
    // The invoice must NOT read paid off a payment that was never written.
    expect(sb.state.invoices["inv-1"]).toMatchObject({ amount_paid: 0, status: "sent" });
  });

  it("returns false without writing when the invoice is missing", async () => {
    const sb = makeSb({ invoices: {}, payments: {} });

    const wrote = await recordRevolutPayment(sb, { businessId: BIZ, invoiceId: "gone", orderId: ORDER, amount: 500 });

    expect(wrote).toBe(false);
    expect(sb.inserted).toHaveLength(0);
  });

  it("does not treat another tenant's order id as already-recorded", async () => {
    const st = baseState();
    st.payments["theirs"] = { id: "theirs", invoice_id: "inv-1", business_id: "biz-2", amount: 1000, provider_payment_id: ORDER };
    const sb = makeSb(st);

    const wrote = await recordRevolutPayment(sb, { businessId: BIZ, invoiceId: "inv-1", orderId: ORDER, amount: 1000 });

    expect(wrote).toBe(true);
  });
});
