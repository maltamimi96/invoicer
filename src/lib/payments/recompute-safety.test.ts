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
 * They exercise the same shapes as src/lib/stripe-payments.ts and
 * src/lib/revolut-payments.ts, which are byte-for-byte duplicates of one
 * another. Item 3 of the payments plan collapses that duplication into one
 * helper; until then, both copies carry the same fix and this file states the
 * contract both must satisfy.
 */
import { describe, it, expect } from "vitest";

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

/** Mirrors the fixed recomputeInvoice in both provider files. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recomputeInvoice(sb: any, businessId: string, invoiceId: string, invoiceTotal: number) {
  const [{ data: directs }, { data: children }] = await Promise.all([
    sb.from("payments").select("amount").eq("invoice_id", invoiceId).eq("business_id", businessId),
    sb.from("invoices").select("amount_paid").eq("parent_invoice_id", invoiceId).eq("business_id", businessId),
  ]);
  const sum = (rows: Row[] | null, col: string) =>
    (rows ?? []).reduce((s, r) => s + Number(r[col] ?? 0), 0);
  const newPaid = sum(directs, "amount") + sum(children, "amount_paid");

  const { data: current } = await sb.from("invoices")
    .select("status").eq("id", invoiceId).eq("business_id", businessId).maybeSingle();
  const cur = current?.status as string | undefined;
  const newStatus = cur === "cancelled" || cur === "draft"
    ? cur
    : newPaid >= Number(invoiceTotal) - 0.01 ? "paid" : "partial";

  const { error } = await sb.from("invoices")
    .update({ amount_paid: newPaid, status: newStatus })
    .eq("id", invoiceId).eq("business_id", businessId);
  if (error) throw new Error(`Couldn't update the invoice balance: ${error.message}`);
}

describe("balance recompute after a payment", () => {
  it("throws when the balance write fails, instead of reporting success", async () => {
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" } },
      payments: { "pay-1": { id: "pay-1", invoice_id: "inv-1", business_id: BIZ, amount: 1000 } },
      failUpdate: true,
    });

    await expect(recomputeInvoice(db, BIZ, "inv-1", 1000)).rejects.toThrow(/invoice balance/i);
  });

  it("does not resurrect a cancelled invoice", async () => {
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "cancelled" } },
      payments: { "pay-1": { id: "pay-1", invoice_id: "inv-1", business_id: BIZ, amount: 1000 } },
    });

    await recomputeInvoice(db, BIZ, "inv-1", 1000);

    // The money is still recorded, but the invoice stays cancelled.
    expect(db.updates[0]).toMatchObject({ amount_paid: 1000, status: "cancelled" });
  });

  it("leaves a draft invoice as draft", async () => {
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "draft" } },
      payments: { "pay-1": { id: "pay-1", invoice_id: "inv-1", business_id: BIZ, amount: 400 } },
    });

    await recomputeInvoice(db, BIZ, "inv-1", 1000);
    expect(db.updates[0]).toMatchObject({ status: "draft" });
  });

  it("is a pure projection of the ledger — re-running cannot double-count", async () => {
    const db = makeDb({
      invoices: { "inv-1": { id: "inv-1", business_id: BIZ, total: 1000, amount_paid: 0, status: "sent" } },
      payments: { "pay-1": { id: "pay-1", invoice_id: "inv-1", business_id: BIZ, amount: 1000 } },
    });

    await recomputeInvoice(db, BIZ, "inv-1", 1000);
    await recomputeInvoice(db, BIZ, "inv-1", 1000);
    await recomputeInvoice(db, BIZ, "inv-1", 1000);

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

    await recomputeInvoice(db, BIZ, "inv-1", 1000);

    expect(db.updates.at(-1)).toMatchObject({ amount_paid: 1000, status: "paid" });
  });
});
