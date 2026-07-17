/**
 * What the assistant did, and how to take it back.
 *
 * Today nothing the agent does is logged or reversible: it can call
 * deleteCustomer / deleteInvoice / deleteWorkOrder with no snapshot, no audit
 * and no undo. This adds the snapshot half. The reversal reuses the exact
 * entry shape cleanup_runs already uses (src/lib/actions/cleanup.ts), so the
 * proven reverse-replay applies unchanged.
 *
 * Deliberately a small allow-list rather than "everything". An undo button that
 * silently fails, or that claims to reverse a sent email, is worse than no
 * button — so a tool is only listed here when the reversal is honest.
 */

import type { AssistantChangeEntry } from "@/types/database";

export interface UndoSpec {
  /** Table the tool mutates. */
  table: string;
  /** Which argument carries the row id. */
  idArg: string;
  /** update = restore prior column values; delete = re-insert the row. */
  op: "update" | "delete";
}

/**
 * Tools whose effect can be honestly reversed from a row snapshot.
 *
 * Not listed, on purpose:
 *  - create_* — reversing a create means deleting the row, which is a
 *    destructive act dressed up as an undo. The user can delete it themselves.
 *  - send_*_email, charge_saved_card, publish_content — genuinely
 *    irreversible. The UI says so rather than pretending.
 *  - merges and cascades — cleanup's own undo handles those with fk_updates;
 *    replicating that here without its proposal step would be guesswork.
 */
export const TOOL_UNDO: Record<string, UndoSpec> = {
  update_customer: { table: "customers", idArg: "customer_id", op: "update" },
  delete_customer: { table: "customers", idArg: "customer_id", op: "delete" },
  update_lead: { table: "leads", idArg: "lead_id", op: "update" },
  set_lead_status: { table: "leads", idArg: "lead_id", op: "update" },
  delete_lead: { table: "leads", idArg: "lead_id", op: "delete" },
  update_invoice: { table: "invoices", idArg: "invoice_id", op: "update" },
  set_invoice_status: { table: "invoices", idArg: "invoice_id", op: "update" },
  delete_invoice: { table: "invoices", idArg: "invoice_id", op: "delete" },
  update_quote: { table: "quotes", idArg: "quote_id", op: "update" },
  set_quote_status: { table: "quotes", idArg: "quote_id", op: "update" },
  delete_quote: { table: "quotes", idArg: "quote_id", op: "delete" },
  update_work_order: { table: "work_orders", idArg: "work_order_id", op: "update" },
  set_work_order_status: { table: "work_orders", idArg: "work_order_id", op: "update" },
  delete_work_order: { table: "work_orders", idArg: "work_order_id", op: "delete" },
  update_product: { table: "products", idArg: "product_id", op: "update" },
  delete_product: { table: "products", idArg: "product_id", op: "delete" },
  update_task: { table: "tasks", idArg: "task_id", op: "update" },
  update_task_status: { table: "tasks", idArg: "task_id", op: "update" },
  delete_task: { table: "tasks", idArg: "task_id", op: "delete" },
};

export function undoSpecFor(toolName: string): UndoSpec | null {
  return TOOL_UNDO[toolName] ?? null;
}

/** The row id a tool call targets, if we can identify one. */
export function targetIdFor(spec: UndoSpec, args: Record<string, unknown>): string | null {
  const v = args[spec.idArg] ?? args.id;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Snapshot a row before a tool touches it.
 *
 * Uses the admin client (the same one the tools use), so it sees the row
 * regardless of RLS — the caller has already been authorised by role.
 */
export async function snapshotRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  table: string,
  id: string,
  businessId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb
    .from(table)
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) return null;
  return (data as Record<string, unknown>) ?? null;
}

/**
 * Build the change entry for one tool call, or null if there's nothing
 * honestly reversible to record.
 */
export function buildChangeEntry(
  tool: string,
  spec: UndoSpec,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  changeId: string
): AssistantChangeEntry | null {
  // No 'before' means we never saw the row — there is nothing to restore, and
  // recording an entry would put an Undo button on an action it can't reverse.
  if (!before) return null;
  return { change_id: changeId, op: spec.op, table: spec.table, before, after, tool };
}

/** Human label for an undo button. */
export function undoLabel(entry: AssistantChangeEntry): string {
  const noun = entry.table.replace(/_/g, " ").replace(/s$/, "");
  return entry.op === "delete" ? `Restore ${noun}` : `Undo change to ${noun}`;
}
