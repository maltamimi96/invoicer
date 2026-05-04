"use server";

/**
 * Generic "Clean up" infrastructure.
 *
 * Every entity that wants a Clean up button registers a proposer here.
 * The proposer scans the rows for that business and returns a list of
 * proposed changes — each with a friendly label, a unique change_id, and
 * the raw operation (`merge` / `delete` / `update`) plus the data needed
 * to apply it. The UI shows them as a checklist. On Apply, the selected
 * changes are executed and recorded into `cleanup_runs.change_log` so
 * Undo can reverse every one of them.
 *
 * AI fuzzy matching is intentionally *not* in this first cut — start with
 * deterministic heuristics (lowercased trimmed email, digits-only phone,
 * normalized name+address) that we can trust without supervision.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

// ─── Public types ─────────────────────────────────────────────────────────

export type CleanupEntity = "customers" | "contacts" | "leads";

export type ProposedChange = {
  /** Stable id within a single proposal session — used by the UI for selection. */
  change_id: string;
  op: "merge" | "delete" | "update";
  /** Friendly label rendered in the review list. */
  label: string;
  /** Optional second line of context. */
  detail?: string;
  /** Severity tint for the UI: low (sort/normalize), med (delete/orphan), high (merge). */
  severity: "low" | "med" | "high";
  /** Implementation payload — opaque to the UI; consumed by applyCleanup. */
  payload: MergePayload | DeletePayload | UpdatePayload;
};

type FkUpdate = { table: string; column: string; row_id: string; from: string; to: string };

type MergePayload = {
  op: "merge";
  table: string;
  survivor_id: string;
  duplicate_ids: string[];
  /** Tables that point at this entity via column = id; we'll relink them. */
  fk_columns: { table: string; column: string }[];
  /** Captured at apply time and stored in the change_log so Undo works. */
};

type DeletePayload = {
  op: "delete";
  table: string;
  id: string;
};

type UpdatePayload = {
  op: "update";
  table: string;
  id: string;
  patch: Record<string, unknown>;
};

// ─── Customers proposer ───────────────────────────────────────────────────

const CUSTOMER_FK_COLUMNS = [
  { table: "invoices",     column: "customer_id" },
  { table: "quotes",       column: "customer_id" },
  { table: "work_orders",  column: "customer_id" },
  { table: "leads",        column: "customer_id" },
  { table: "contacts",     column: "customer_id" },
  { table: "sites",        column: "account_id"  }, // sites.account_id -> customers.id
];

function normEmail(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}
function normPhone(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}
function normNameAddr(name: string | null | undefined, addr: string | null | undefined) {
  const n = (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const a = (addr ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return n && a ? `${n}|${a}` : "";
}

interface CustomerRow {
  id: string;
  business_id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
}

export async function proposeCleanup(entity: CleanupEntity): Promise<{
  proposals: ProposedChange[];
  total_rows: number;
}> {
  switch (entity) {
    case "customers": return proposeCustomerCleanup();
    default:
      throw new Error(`No cleanup proposer registered for "${entity}" yet`);
  }
}

async function proposeCustomerCleanup() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: rows, error } = await tbl(supabase, "customers")
    .select("*")
    .eq("business_id", businessId)
    .eq("archived", false)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const customers: CustomerRow[] = (rows ?? []) as CustomerRow[];
  const proposals: ProposedChange[] = [];

  // Cluster by identity key. Priority: email > phone > name+address.
  // Within a cluster, oldest row wins — newer ones get merged into it.
  const seen = new Set<string>();
  const cluster = (key: string, rows: CustomerRow[]) => {
    if (rows.length < 2 || seen.has(key)) return;
    seen.add(key);
    const survivor = rows[0]; // oldest
    const dupes    = rows.slice(1);
    const dupSummary = dupes.map((d) => d.name).slice(0, 3).join(", ") +
                       (dupes.length > 3 ? `, +${dupes.length - 3} more` : "");
    proposals.push({
      change_id: `merge-${survivor.id}`,
      op: "merge",
      severity: "high",
      label: `Merge ${dupes.length + 1} duplicate${dupes.length === 0 ? "" : "s"}: ${survivor.name}`,
      detail: `Keep ${survivor.name} (oldest), absorb ${dupSummary}. Re-links every invoice / quote / work order / site / lead / contact pointing at the duplicates.`,
      payload: {
        op: "merge",
        table: "customers",
        survivor_id: survivor.id,
        duplicate_ids: dupes.map((d) => d.id),
        fk_columns: CUSTOMER_FK_COLUMNS,
      },
    });
  };

  // Group by email
  const byEmail: Record<string, CustomerRow[]> = {};
  for (const c of customers) {
    const k = normEmail(c.email);
    if (!k) continue;
    (byEmail[k] ??= []).push(c);
  }
  for (const [k, group] of Object.entries(byEmail)) cluster(`email:${k}`, group);

  // Group by phone
  const byPhone: Record<string, CustomerRow[]> = {};
  for (const c of customers) {
    const k = normPhone(c.phone);
    if (!k || k.length < 6) continue;
    (byPhone[k] ??= []).push(c);
  }
  for (const [k, group] of Object.entries(byPhone)) cluster(`phone:${k}`, group);

  // Group by name+address (only for rows without email AND phone)
  const byNameAddr: Record<string, CustomerRow[]> = {};
  for (const c of customers) {
    if (normEmail(c.email) || normPhone(c.phone)) continue;
    const k = normNameAddr(c.name, [c.address, c.city, c.postcode].filter(Boolean).join(" "));
    if (!k) continue;
    (byNameAddr[k] ??= []).push(c);
  }
  for (const [k, group] of Object.entries(byNameAddr)) cluster(`namaddr:${k}`, group);

  // Track every id that's going to be merged-as-duplicate so we don't
  // also propose a tidy on a row that'll be deleted seconds later.
  const willBeMerged = new Set<string>();
  for (const p of proposals) {
    if (p.op === "merge") for (const id of (p.payload as MergePayload).duplicate_ids) willBeMerged.add(id);
  }

  // Normalize email casing / trim whitespace
  for (const c of customers) {
    if (willBeMerged.has(c.id)) continue;
    const trimmedName  = c.name?.trim();
    const loweredEmail = c.email?.trim().toLowerCase() || null;
    const trimmedPhone = c.phone?.trim() || null;
    const patch: Record<string, unknown> = {};
    if (trimmedName  && trimmedName  !== c.name)  patch.name  = trimmedName;
    if (loweredEmail !== c.email && (loweredEmail || c.email)) patch.email = loweredEmail;
    if (trimmedPhone !== c.phone && (trimmedPhone || c.phone)) patch.phone = trimmedPhone;
    if (Object.keys(patch).length === 0) continue;

    proposals.push({
      change_id: `norm-${c.id}`,
      op: "update",
      severity: "low",
      label: `Tidy ${c.name}`,
      detail: Object.entries(patch).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · "),
      payload: { op: "update", table: "customers", id: c.id, patch },
    });
  }

  return { proposals, total_rows: customers.length };
}

// ─── Apply ────────────────────────────────────────────────────────────────

interface AppliedChangeEntry {
  change_id: string;
  op: "merge" | "delete" | "update";
  /** What we'd need to recreate / reverse the operation. */
  before: unknown;
  after: unknown;
  fk_updates?: FkUpdate[];
}

export async function applyCleanup(
  entity: CleanupEntity,
  proposals: ProposedChange[],
  selected_ids: string[],
): Promise<{ run_id: string; applied: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const selected = proposals.filter((p) => selected_ids.includes(p.change_id));
  if (selected.length === 0) throw new Error("No changes selected");

  // Run order: updates first → deletes → merges last. Otherwise a "tidy"
  // update can target a row a merge already absorbed and nuke the run.
  const order: Record<ProposedChange["op"], number> = { update: 0, delete: 1, merge: 2 };
  selected.sort((a, b) => order[a.op] - order[b.op]);

  // Build a set of row ids that will be deleted by merges so updates can skip
  // them gracefully (instead of erroring on "no row found").
  const willBeDeleted = new Set<string>();
  for (const c of selected) {
    if (c.op === "merge") for (const id of (c.payload as MergePayload).duplicate_ids) willBeDeleted.add(id);
    if (c.op === "delete") willBeDeleted.add((c.payload as DeletePayload).id);
  }

  const log: AppliedChangeEntry[] = [];

  for (const change of selected) {
    if (change.op === "update") {
      const { table, id, patch } = change.payload as UpdatePayload;
      // Skip if this row's about to be deleted by a merge — there's no point
      // tidying fields on a customer we're absorbing into another.
      if (willBeDeleted.has(id)) continue;
      // Capture before for undo
      const { data: before } = await tbl(supabase, table).select("*").eq("id", id).maybeSingle();
      if (!before) continue; // Row vanished between propose and apply — skip silently
      const { data: after, error } = await tbl(supabase, table)
        .update(patch).eq("id", id).select().maybeSingle();
      if (error) throw new Error(`Update failed on ${table} ${id}: ${error.message}`);
      if (!after) continue;
      log.push({ change_id: change.change_id, op: "update", before, after });
    } else if (change.op === "delete") {
      const { table, id } = change.payload as DeletePayload;
      const { data: before } = await tbl(supabase, table).select("*").eq("id", id).maybeSingle();
      const { error } = await tbl(supabase, table).delete().eq("id", id);
      if (error) throw new Error(`Delete failed on ${table} ${id}: ${error.message}`);
      log.push({ change_id: change.change_id, op: "delete", before, after: null });
    } else if (change.op === "merge") {
      const { table, survivor_id, duplicate_ids, fk_columns } = change.payload as MergePayload;

      // Capture full duplicates so undo can re-create them with same ids
      const { data: dupRows } = await tbl(supabase, table).select("*").in("id", duplicate_ids);
      // Pull the survivor too — we'll fill any null fields from duplicates
      const { data: survivor } = await tbl(supabase, table).select("*").eq("id", survivor_id).maybeSingle();

      // Re-link FK rows that point at any of the duplicates → survivor.
      // Capture each FK update so undo can flip them back.
      const fkUpdates: FkUpdate[] = [];
      for (const fc of fk_columns) {
        const { data: refs } = await tbl(supabase, fc.table)
          .select(`id, ${fc.column}`)
          .in(fc.column, duplicate_ids);
        const refRows = (refs ?? []) as Array<Record<string, string>>;
        for (const r of refRows) {
          fkUpdates.push({
            table: fc.table,
            column: fc.column,
            row_id: r.id,
            from: r[fc.column],   // original duplicate id we'll restore on undo
            to:   survivor_id,
          });
        }
        // Relink each row by id so we hit exactly the rows we just recorded.
        for (const r of refRows) {
          const { error: relinkErr } = await tbl(supabase, fc.table)
            .update({ [fc.column]: survivor_id })
            .eq("id", r.id);
          if (relinkErr) console.error(`Relink ${fc.table}.${fc.column} for ${r.id} failed:`, relinkErr.message);
        }
      }

      // Fill null fields on survivor from duplicates (oldest-non-null wins)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const merged: Record<string, any> = { ...(survivor ?? {}) };
      for (const dup of (dupRows ?? []) as Record<string, unknown>[]) {
        for (const [k, v] of Object.entries(dup)) {
          if (k === "id" || k === "created_at" || k === "updated_at" || k === "business_id" || k === "user_id") continue;
          if (merged[k] == null && v != null) merged[k] = v;
        }
      }
      delete merged.id;
      delete merged.created_at;
      delete merged.updated_at;
      const { error: updateErr } = await tbl(supabase, table).update(merged).eq("id", survivor_id);
      if (updateErr) console.error("Survivor merge update failed:", updateErr.message);

      // Delete duplicates last
      const { error: delErr } = await tbl(supabase, table).delete().in("id", duplicate_ids);
      if (delErr) throw new Error(`Delete duplicates failed: ${delErr.message}`);

      log.push({
        change_id: change.change_id,
        op: "merge",
        before: dupRows,           // full rows so we can re-insert them with same ids
        after: { survivor_id },
        fk_updates: fkUpdates,
      });
    }
  }

  // Record the run
  const summary = `${log.length} change${log.length === 1 ? "" : "s"} applied to ${entity}`;
  const { data: run, error: runErr } = await tbl(supabase, "cleanup_runs")
    .insert({
      business_id: businessId,
      user_id: user.id,
      entity,
      change_log: log,
      summary,
    })
    .select("id")
    .single();
  if (runErr) throw new Error(`Couldn't record cleanup run: ${runErr.message}`);

  revalidatePath(`/${entity}`);
  return { run_id: run.id, applied: log.length };
}

// ─── Undo ─────────────────────────────────────────────────────────────────

export async function undoCleanup(run_id: string): Promise<{ reverted: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: run, error: runErr } = await tbl(supabase, "cleanup_runs")
    .select("*")
    .eq("id", run_id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (runErr || !run) throw new Error("Cleanup run not found");
  if (run.status === "undone") throw new Error("This cleanup has already been undone");

  const log: AppliedChangeEntry[] = (run.change_log ?? []) as AppliedChangeEntry[];
  let reverted = 0;

  // Reverse in reverse order so dependent operations untangle cleanly
  for (const entry of [...log].reverse()) {
    if (entry.op === "update") {
      const before = entry.before as Record<string, unknown> & { id: string };
      if (!before?.id) continue;
      // Set the row back to its before state (only the keys we changed)
      const after = entry.after as Record<string, unknown> | null;
      const restore: Record<string, unknown> = {};
      for (const k of Object.keys(after ?? {})) {
        if (k === "id" || k === "updated_at") continue;
        if ((before as Record<string, unknown>)[k] !== (after as Record<string, unknown>)[k]) {
          restore[k] = (before as Record<string, unknown>)[k];
        }
      }
      if (Object.keys(restore).length > 0) {
        await tbl(supabase, "customers").update(restore).eq("id", before.id);
      }
      reverted++;
    } else if (entry.op === "delete") {
      const before = entry.before as Record<string, unknown> | null;
      if (!before) continue;
      await tbl(supabase, "customers").insert(before);
      reverted++;
    } else if (entry.op === "merge") {
      const dupRows = (entry.before as Record<string, unknown>[]) ?? [];
      // Re-insert the duplicates with their original ids first — children's
      // FK updates need the rows back in the table before the FK constraint
      // accepts the relink.
      if (dupRows.length > 0) {
        const { error: reinsertErr } = await tbl(supabase, "customers").insert(dupRows);
        if (reinsertErr) console.error("Re-insert duplicates failed:", reinsertErr.message);
      }
      // Flip every captured FK update back to its original duplicate id.
      for (const fk of entry.fk_updates ?? []) {
        await tbl(supabase, fk.table).update({ [fk.column]: fk.from }).eq("id", fk.row_id);
      }
      reverted++;
    }
  }

  // Mark the run undone
  await tbl(supabase, "cleanup_runs")
    .update({ status: "undone", undone_at: new Date().toISOString() })
    .eq("id", run_id);

  revalidatePath(`/${run.entity}`);
  return { reverted };
}
