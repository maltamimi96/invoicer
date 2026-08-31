/**
 * Deriving `amount_paid` and `status` from the payments ledger.
 *
 * These two functions existed twice, byte-for-byte, in src/lib/stripe-payments.ts
 * and src/lib/revolut-payments.ts. Two copies of money logic is a defect waiting
 * to happen — and it already had happened: when the cancelled/draft guard and
 * the missing error checks were fixed, both copies had to be edited in step, and
 * nothing but discipline was keeping them in agreement.
 *
 * They are also the reason the safety tests were weak. A private function
 * duplicated across two modules cannot be imported, so the tests had to
 * re-implement the logic they were meant to be testing. Now they exercise the
 * shipped code.
 *
 * THE RULE: the payments ledger is the truth. `amount_paid` is a projection of
 * it — direct payments plus whatever child invoices have collected — never a
 * value that is incremented in place. Every function here is therefore
 * idempotent: running it twice produces the same answer, which is what makes a
 * provider webhook retry safe to treat as a repair.
 */

/**
 * Minimal shape needed from a Supabase-ish client: a table name in, a query
 * builder out. Matches the accessor `settleInvoiceToPaid` takes, so both
 * modules in this folder are called the same way.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TableAccessor = (table: string) => any;

/**
 * Currency is numeric(12,2); anything inside a cent is float noise.
 * Exported so settle.ts uses the same number — they were 0.01 and 0.005, which
 * left a sliver where settle would write a balancing row for an amount this
 * function already considered settled.
 */
export const PAID_TOLERANCE = 0.01;

/** Statuses that a payment must never move an invoice out of. */
const FROZEN_STATUSES = new Set(["cancelled", "draft"]);

function sumColumn(rows: unknown, column: string): number {
  return ((rows ?? []) as Record<string, unknown>[])
    .reduce((total, row) => total + Number(row[column] ?? 0), 0);
}

/**
 * Recompute one invoice's `amount_paid` and `status` from the ledger.
 *
 * Throws if the write fails. It must: the payment row is already committed by
 * the time this runs, so swallowing the error leaves money recorded against an
 * invoice that still reads unpaid — and the dunning cron then chases the
 * customer for it, with nothing surfaced anywhere.
 */
export async function recomputeInvoicePaid(
  from: TableAccessor,
  businessId: string,
  invoiceId: string,
  invoiceTotal: number,
): Promise<{ amountPaid: number; status: string }> {
  const [{ data: directs }, { data: childCollections }] = await Promise.all([
    from("payments").select("amount").eq("invoice_id", invoiceId).eq("business_id", businessId),
    from("invoices").select("amount_paid").eq("parent_invoice_id", invoiceId).eq("business_id", businessId),
  ]);

  const amountPaid = sumColumn(directs, "amount") + sumColumn(childCollections, "amount_paid");

  // A payment landing on a cancelled or draft invoice must not resurrect it.
  // recomputeParentPaid has always had this guard; this one did not.
  const { data: current } = await from("invoices")
    .select("status").eq("id", invoiceId).eq("business_id", businessId).maybeSingle();
  const currentStatus = current?.status as string | undefined;
  const status = currentStatus && FROZEN_STATUSES.has(currentStatus)
    ? currentStatus
    : amountPaid >= Number(invoiceTotal) - PAID_TOLERANCE ? "paid" : "partial";

  const { error } = await from("invoices")
    .update({ amount_paid: amountPaid, status })
    .eq("id", invoiceId).eq("business_id", businessId);
  if (error) throw new Error(`Couldn't update the invoice balance: ${error.message}`);

  return { amountPaid, status };
}

/**
 * Roll a child's collection up into its progress-billed parent.
 *
 * Returns null when the parent is missing, which is not an error — a child can
 * outlive a deleted parent.
 */
export async function recomputeParentPaid(
  from: TableAccessor,
  businessId: string,
  parentId: string,
): Promise<{ amountPaid: number; status: string } | null> {
  const [{ data: siblings }, { data: parentDirects }, { data: parentRow }] = await Promise.all([
    from("invoices").select("amount_paid").eq("parent_invoice_id", parentId).eq("business_id", businessId),
    from("payments").select("amount").eq("invoice_id", parentId).eq("business_id", businessId),
    from("invoices").select("total, status").eq("id", parentId).eq("business_id", businessId).maybeSingle(),
  ]);
  if (!parentRow) return null;

  const amountPaid = sumColumn(parentDirects, "amount") + sumColumn(siblings, "amount_paid");
  const parentTotal = Number(parentRow.total ?? 0);

  let status = parentRow.status as string;
  if (!FROZEN_STATUSES.has(status)) {
    if (amountPaid >= parentTotal - PAID_TOLERANCE) status = "paid";
    else if (amountPaid > PAID_TOLERANCE) status = "partial";
  }

  const { error } = await from("invoices")
    .update({ amount_paid: amountPaid, status })
    .eq("id", parentId).eq("business_id", businessId);
  if (error) throw new Error(`Couldn't update the parent invoice balance: ${error.message}`);

  return { amountPaid, status };
}
