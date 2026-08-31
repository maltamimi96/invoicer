/**
 * Settling an invoice to "paid".
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * Marking an invoice paid used to write `amount_paid = total` straight onto the
 * invoice row and insert nothing into `payments`. Four server paths did it that
 * way and each had its own copy. That produced two live defects:
 *
 *  1. UN-PAYING. `addPayment` recomputes `amount_paid` from the payments ledger.
 *     So: mark a $10,000 invoice paid, then
 *     record a $500 payment properly, and the recompute finds only that $500 in
 *     the ledger and writes `amount_paid = 500, status = 'partial'`. The invoice
 *     now reads $9,500 outstanding and is picked up by the dunning cron
 *     (src/app/api/cron/invoice-reminders/route.ts selects status in
 *     ('sent','partial')), which emails the customer chasing money they have
 *     already paid. That is the most natural operator sequence in the product.
 *
 *  2. PARENT ROLLUP. A deposit child marked paid contributed nothing to its
 *     parent job, because the rollup sums a ledger that had no row in it.
 *
 * The rule this file encodes: **the payments ledger is the truth, and
 * `amount_paid` is derived from it.** Marking paid means "write whatever
 * balancing entry makes the ledger add up to the total", not "set the column".
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES NOT DO
 *
 * It does not repair history. Invoices marked paid *before* this shipped still
 * have `amount_paid = total` and no ledger rows, so they can still be un-paid by
 * a later payment. Healing those needs a backfill migration over real money
 * records, which is deliberately not attempted here — see
 * `clients/kirei/web/2026-08-31-payments-fix-plan.md` in the agency workspace.
 *
 * KNOWN LIMITATION: un-marking a paid invoice back to `sent` leaves the
 * balancing row behind, so the next recompute reads it as paid again. There is
 * no delete-payment instrument in the product today. Removing a balancing row
 * means deleting it directly.
 */

// One tolerance, shared with the recompute, so a balance this file decides is
// worth writing is never one the recompute already treats as settled.
import { PAID_TOLERANCE, collectedForInvoice } from "./recompute";

/**
 * Minimal shape this helper needs from a Supabase-ish client: give it a table
 * name, get a query builder. Callers pass whatever accessor they already use —
 * `tbl(supabase, t)` in server actions, `t(ctx, t)` in MCP tools, `supa.from(t)`
 * on the raw client — so this works on all of them without caring which.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TableAccessor = (table: string) => any;

/** Marks the ledger rows this helper writes, so they are identifiable later. */
export const MARKED_PAID_METHOD = "Manual — marked paid";


export type SettleResult = {
  /** True when a balancing ledger row was written. */
  inserted: boolean;
  /** Amount of the balancing row; 0 when nothing was owed. */
  balancingAmount: number;
  /** What the invoice's amount_paid was set to. */
  amountPaid: number;
};

/**
 * Bring an invoice to fully-paid by writing the balancing ledger entry, then
 * setting `amount_paid` and `status` from what the ledger now says.
 *
 * Idempotent: calling it twice inserts nothing the second time, because the
 * first call left no outstanding balance. That is what makes it safe to retry
 * and safe to call from a UI that can be double-clicked, without needing a new
 * database constraint.
 *
 * Throws if the invoice is missing or if any write fails. A failed balancing
 * insert must never be followed by a status write — that would recreate the
 * exact "UI says paid, ledger says otherwise" defect this replaces.
 */
export async function settleInvoiceToPaid(
  from: TableAccessor,
  opts: { businessId: string; invoiceId: string; userId: string; date?: string },
): Promise<SettleResult> {
  const { businessId, invoiceId, userId } = opts;

  const { data: invoice, error: invoiceError } = await from("invoices")
    .select("total")
    .eq("id", invoiceId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (invoiceError) throw new Error(`Couldn't read the invoice: ${invoiceError.message}`);
  if (!invoice) throw new Error("Invoice not found");

  const total = Number((invoice as { total: unknown }).total ?? 0);

  // Collected has two sources, and both must count or a parent invoice gets a
  // balancing row for money its children already collected. Delegated to the
  // canonical reader rather than re-derived here — this file used to carry its
  // own copy of that sum, which is the duplication recompute.ts exists to end.
  const collected = await collectedForInvoice(from, businessId, invoiceId);
  const balance = Number((total - collected).toFixed(2));

  let inserted = false;
  if (balance > PAID_TOLERANCE) {
    const { error: insertError } = await from("payments").insert({
      invoice_id: invoiceId,
      business_id: businessId,
      user_id: userId,
      amount: balance,
      date: opts.date ?? new Date().toISOString().slice(0, 10),
      method: MARKED_PAID_METHOD,
    });
    // Unchecked here would mean the invoice flips to "paid" over an empty
    // ledger — the mobile defect, reproduced on the server.
    if (insertError) throw new Error(`Couldn't record the balancing payment: ${insertError.message}`);
    inserted = true;
  }

  const amountPaid = inserted ? collected + balance : collected;

  const { error: updateError } = await from("invoices")
    .update({ amount_paid: amountPaid, status: "paid" })
    .eq("id", invoiceId)
    .eq("business_id", businessId);
  if (updateError) throw new Error(`Couldn't update the invoice balance: ${updateError.message}`);

  return { inserted, balancingAmount: inserted ? balance : 0, amountPaid };
}
