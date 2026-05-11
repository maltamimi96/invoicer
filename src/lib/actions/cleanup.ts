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

import { getUser } from "@/lib/auth";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

// ─── Public types ─────────────────────────────────────────────────────────

export type CleanupEntity =
  | "customers"
  | "contacts"
  | "leads"
  | "invoices"
  | "quotes"
  | "products"
  | "work_orders"
  | "team_profiles";

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
    case "customers":     return proposeCustomerCleanup();
    case "contacts":      return proposeContactsCleanup();
    case "leads":         return proposeLeadsCleanup();
    case "invoices":      return proposeInvoicesCleanup();
    case "quotes":        return proposeQuotesCleanup();
    case "products":      return proposeProductsCleanup();
    case "work_orders":   return proposeWorkOrdersCleanup();
    case "team_profiles": return proposeTeamProfilesCleanup();
    default: {
      const _: never = entity;
      throw new Error(`No cleanup proposer registered for "${_}"`);
    }
  }
}

async function proposeCustomerCleanup() {
  const supabase = await createClient();
  const user = await getUser();
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

  // Pull all FK references so we can propose safe deletes for empty rows
  // (only when no children point at them).
  const idsRefByFk = new Set<string>();
  for (const fc of CUSTOMER_FK_COLUMNS) {
    const { data: refs } = await tbl(supabase, fc.table)
      .select(fc.column)
      .eq("business_id", businessId)
      .not(fc.column, "is", null);
    for (const r of (refs ?? []) as Array<Record<string, string | null>>) {
      const id = r[fc.column];
      if (id) idsRefByFk.add(id);
    }
  }

  // Empty rows — name is the only NOT NULL column on customers. Propose a
  // delete when nothing real is on the row AND nothing FK-references it.
  // Otherwise (rare: an invoice points at a name-only customer), propose
  // archiving instead so the historical link stays intact.
  for (const c of customers) {
    const isEmpty =
      !c.email?.trim() && !c.phone?.trim() &&
      !c.address?.trim() && !c.city?.trim() &&
      !c.postcode?.trim() && !c.country?.trim() &&
      !c.company?.trim() && !c.notes?.trim() &&
      // Either name is missing/placeholder OR all the rest is missing.
      (!c.name?.trim() || /^(unknown|n\/a|new customer|no name|customer)$/i.test(c.name.trim()) || true);

    if (!isEmpty) continue;

    const referenced = idsRefByFk.has(c.id);
    if (referenced) {
      proposals.push({
        change_id: `arch-${c.id}`,
        op: "update",
        severity: "med",
        label: `Archive empty customer · ${c.name || "(no name)"}`,
        detail: "All fields are blank, but invoices / quotes / sites still reference this row — archiving instead of deleting keeps history intact.",
        payload: { op: "update", table: "customers", id: c.id, patch: { archived: true } },
      });
    } else {
      proposals.push({
        change_id: `del-${c.id}`,
        op: "delete",
        severity: "med",
        label: `Delete empty customer · ${c.name || "(no name)"}`,
        detail: "No email, phone, address, company, or notes — and nothing else points at this row.",
        payload: { op: "delete", table: "customers", id: c.id },
      });
    }
  }

  // Track every id that'll be removed (merged / deleted / archived) so we
  // don't also propose a tidy on a row that'll be gone seconds later.
  const willBeRemoved = new Set<string>();
  for (const p of proposals) {
    if (p.op === "merge")  for (const id of (p.payload as MergePayload).duplicate_ids) willBeRemoved.add(id);
    if (p.op === "delete") willBeRemoved.add((p.payload as DeletePayload).id);
    if (p.op === "update" && p.change_id.startsWith("arch-")) {
      willBeRemoved.add((p.payload as UpdatePayload).id);
    }
  }

  // Normalize email casing / trim whitespace
  for (const c of customers) {
    if (willBeRemoved.has(c.id)) continue;
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
  /** Table this change targeted — needed for undo to talk to the right row. */
  table: string;
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
  const user = await getUser();
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
      log.push({ change_id: change.change_id, op: "update", table, before, after });
    } else if (change.op === "delete") {
      const { table, id } = change.payload as DeletePayload;
      const { data: before } = await tbl(supabase, table).select("*").eq("id", id).maybeSingle();
      const { error } = await tbl(supabase, table).delete().eq("id", id);
      if (error) throw new Error(`Delete failed on ${table} ${id}: ${error.message}`);
      log.push({ change_id: change.change_id, op: "delete", table, before, after: null });
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
        table,
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
  const user = await getUser();
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
    const targetTable = entry.table || "customers"; // legacy entries default to customers
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
        await tbl(supabase, targetTable).update(restore).eq("id", before.id);
      }
      reverted++;
    } else if (entry.op === "delete") {
      const before = entry.before as Record<string, unknown> | null;
      if (!before) continue;
      await tbl(supabase, targetTable).insert(before);
      reverted++;
    } else if (entry.op === "merge") {
      const dupRows = (entry.before as Record<string, unknown>[]) ?? [];
      // Re-insert the duplicates with their original ids first — children's
      // FK updates need the rows back in the table before the FK constraint
      // accepts the relink.
      if (dupRows.length > 0) {
        const { error: reinsertErr } = await tbl(supabase, targetTable).insert(dupRows);
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

// ─── Generic helpers ──────────────────────────────────────────────────────

async function pullRows(table: string, select: string = "*", filterArchived = true) {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  let q = tbl(supabase, table).select(select).eq("business_id", businessId);
  if (filterArchived) {
    // Some tables don't have an archived column; ignore the error if so.
    q = q.or(`archived.is.null,archived.eq.false`);
  }
  q = q.order("created_at", { ascending: true });
  const { data } = await q;
  return { rows: (data ?? []) as Record<string, unknown>[], businessId, supabase };
}

// ─── Contacts (CRM) ───────────────────────────────────────────────────────

interface ContactRow {
  id: string; name: string; email: string | null; phone: string | null;
  company: string | null; lifecycle_stage?: string | null; notes: string | null;
  customer_id: string | null;
}

async function proposeContactsCleanup() {
  const { rows } = await pullRows("contacts");
  const contacts = rows as unknown as ContactRow[];
  const proposals: ProposedChange[] = [];

  // Dedup by email > phone (no FK relinks needed — contacts has no inbound FKs)
  const seen = new Set<string>();
  const cluster = (key: string, group: ContactRow[]) => {
    if (group.length < 2 || seen.has(key)) return;
    seen.add(key);
    const survivor = group[0];
    const dupes = group.slice(1);
    proposals.push({
      change_id: `merge-c-${survivor.id}`,
      op: "merge",
      severity: "high",
      label: `Merge ${dupes.length + 1} duplicate contacts: ${survivor.name}`,
      detail: `Keep the oldest, absorb ${dupes.length} other entr${dupes.length === 1 ? "y" : "ies"}.`,
      payload: {
        op: "merge",
        table: "contacts",
        survivor_id: survivor.id,
        duplicate_ids: dupes.map((d) => d.id),
        fk_columns: [],
      },
    });
  };

  const byEmail: Record<string, ContactRow[]> = {};
  for (const c of contacts) {
    const k = normEmail(c.email);
    if (k) (byEmail[k] ??= []).push(c);
  }
  for (const [k, g] of Object.entries(byEmail)) cluster(`email:${k}`, g);

  const byPhone: Record<string, ContactRow[]> = {};
  for (const c of contacts) {
    if (normEmail(c.email)) continue; // already handled
    const k = normPhone(c.phone);
    if (k && k.length >= 6) (byPhone[k] ??= []).push(c);
  }
  for (const [k, g] of Object.entries(byPhone)) cluster(`phone:${k}`, g);

  // Empty rows — only delete if not linked to a customer
  const removed = new Set<string>();
  for (const p of proposals) {
    if (p.op === "merge") for (const id of (p.payload as MergePayload).duplicate_ids) removed.add(id);
  }
  for (const c of contacts) {
    if (removed.has(c.id)) continue;
    if (c.email?.trim() || c.phone?.trim() || c.company?.trim() || c.notes?.trim()) continue;
    if (c.customer_id) {
      proposals.push({
        change_id: `arch-c-${c.id}`, op: "update", severity: "med",
        label: `Archive empty contact · ${c.name || "(no name)"}`,
        detail: "Linked to a customer but otherwise empty.",
        payload: { op: "update", table: "contacts", id: c.id, patch: { archived: true } },
      });
      removed.add(c.id);
    } else {
      proposals.push({
        change_id: `del-c-${c.id}`, op: "delete", severity: "med",
        label: `Delete empty contact · ${c.name || "(no name)"}`,
        detail: "No email, phone, company, notes, or customer link.",
        payload: { op: "delete", table: "contacts", id: c.id },
      });
      removed.add(c.id);
    }
  }

  // Tidy
  for (const c of contacts) {
    if (removed.has(c.id)) continue;
    const trimmed = c.name?.trim();
    const lowered = c.email?.trim().toLowerCase() || null;
    const patch: Record<string, unknown> = {};
    if (trimmed && trimmed !== c.name) patch.name = trimmed;
    if (lowered !== c.email && (lowered || c.email)) patch.email = lowered;
    if (Object.keys(patch).length === 0) continue;
    proposals.push({
      change_id: `norm-c-${c.id}`, op: "update", severity: "low",
      label: `Tidy ${c.name}`,
      detail: Object.entries(patch).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · "),
      payload: { op: "update", table: "contacts", id: c.id, patch },
    });
  }

  return { proposals, total_rows: contacts.length };
}

// ─── Leads ────────────────────────────────────────────────────────────────

interface LeadRow {
  id: string; name: string; email: string | null; phone: string | null;
  status: string; created_at: string; customer_id: string | null;
  source: string | null; notes: string | null;
}

async function proposeLeadsCleanup() {
  const { rows } = await pullRows("leads", "*", false);
  const leads = rows as unknown as LeadRow[];
  const proposals: ProposedChange[] = [];
  const removed = new Set<string>();

  // Empty rows — no email, phone, or notes; no conversion to customer.
  for (const l of leads) {
    if (l.email?.trim() || l.phone?.trim() || l.notes?.trim() || l.customer_id) continue;
    proposals.push({
      change_id: `del-l-${l.id}`, op: "delete", severity: "med",
      label: `Delete empty lead · ${l.name || "(no name)"}`,
      detail: "No email, phone, notes, or conversion.",
      payload: { op: "delete", table: "leads", id: l.id },
    });
    removed.add(l.id);
  }

  // Stale "new" leads older than 90 days → mark as lost so the inbox stays clean.
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  for (const l of leads) {
    if (removed.has(l.id)) continue;
    if (l.status !== "new") continue;
    if (new Date(l.created_at).getTime() > ninetyDaysAgo) continue;
    proposals.push({
      change_id: `lost-l-${l.id}`, op: "update", severity: "med",
      label: `Mark stale lead as lost · ${l.name || "(no name)"}`,
      detail: "Status='new' and untouched for 90+ days.",
      payload: { op: "update", table: "leads", id: l.id, patch: { status: "lost" } },
    });
  }

  // Tidy
  for (const l of leads) {
    if (removed.has(l.id)) continue;
    const trimmed = l.name?.trim();
    const lowered = l.email?.trim().toLowerCase() || null;
    const patch: Record<string, unknown> = {};
    if (trimmed && trimmed !== l.name) patch.name = trimmed;
    if (lowered !== l.email && (lowered || l.email)) patch.email = lowered;
    if (Object.keys(patch).length === 0) continue;
    proposals.push({
      change_id: `norm-l-${l.id}`, op: "update", severity: "low",
      label: `Tidy ${l.name}`,
      detail: Object.entries(patch).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · "),
      payload: { op: "update", table: "leads", id: l.id, patch },
    });
  }

  return { proposals, total_rows: leads.length };
}

// ─── Invoices ─────────────────────────────────────────────────────────────

interface InvoiceRow {
  id: string; number: string; status: string;
  due_date: string | null; total: number; amount_paid: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  line_items: any; created_at: string;
}

async function proposeInvoicesCleanup() {
  const { rows } = await pullRows("invoices", "*", false);
  const invoices = rows as unknown as InvoiceRow[];
  const proposals: ProposedChange[] = [];
  const today = new Date().toISOString().split("T")[0];
  const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;

  // Mark sent invoices past their due_date as overdue.
  for (const inv of invoices) {
    if (inv.status !== "sent" && inv.status !== "partial") continue;
    if (!inv.due_date || inv.due_date >= today) continue;
    proposals.push({
      change_id: `overdue-${inv.id}`, op: "update", severity: "med",
      label: `Mark ${inv.number} as overdue`,
      detail: `Due ${inv.due_date}, status still ${inv.status}.`,
      payload: { op: "update", table: "invoices", id: inv.id, patch: { status: "overdue" } },
    });
  }

  // Cancel stale empty drafts (no items, older than 60 days).
  for (const inv of invoices) {
    if (inv.status !== "draft") continue;
    const items = Array.isArray(inv.line_items) ? inv.line_items : [];
    if (items.length > 0) continue;
    if (new Date(inv.created_at).getTime() > sixtyDaysAgo) continue;
    proposals.push({
      change_id: `del-i-${inv.id}`, op: "delete", severity: "med",
      label: `Delete empty draft ${inv.number}`,
      detail: "No line items, untouched for 60+ days.",
      payload: { op: "delete", table: "invoices", id: inv.id },
    });
  }

  return { proposals, total_rows: invoices.length };
}

// ─── Quotes ───────────────────────────────────────────────────────────────

interface QuoteRow {
  id: string; number: string; status: string;
  expiry_date: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  line_items: any; created_at: string;
}

async function proposeQuotesCleanup() {
  const { rows } = await pullRows("quotes", "*", false);
  const quotes = rows as unknown as QuoteRow[];
  const proposals: ProposedChange[] = [];
  const today = new Date().toISOString().split("T")[0];
  const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;

  // Mark sent quotes past their expiry_date as expired.
  for (const q of quotes) {
    if (q.status !== "sent") continue;
    if (!q.expiry_date || q.expiry_date >= today) continue;
    proposals.push({
      change_id: `expired-${q.id}`, op: "update", severity: "med",
      label: `Mark ${q.number} as expired`,
      detail: `Expired ${q.expiry_date}, status still sent.`,
      payload: { op: "update", table: "quotes", id: q.id, patch: { status: "expired" } },
    });
  }

  // Drop stale empty drafts.
  for (const q of quotes) {
    if (q.status !== "draft") continue;
    const items = Array.isArray(q.line_items) ? q.line_items : [];
    if (items.length > 0) continue;
    if (new Date(q.created_at).getTime() > sixtyDaysAgo) continue;
    proposals.push({
      change_id: `del-q-${q.id}`, op: "delete", severity: "med",
      label: `Delete empty draft ${q.number}`,
      detail: "No line items, untouched for 60+ days.",
      payload: { op: "delete", table: "quotes", id: q.id },
    });
  }

  return { proposals, total_rows: quotes.length };
}

// ─── Products ─────────────────────────────────────────────────────────────

interface ProductRow {
  id: string; name: string; description: string | null; unit_price: number;
  unit: string | null; archived: boolean;
}

async function proposeProductsCleanup() {
  const { rows } = await pullRows("products");
  const products = rows as unknown as ProductRow[];
  const proposals: ProposedChange[] = [];

  // Dedup by case-insensitive name.
  const seen = new Set<string>();
  const byName: Record<string, ProductRow[]> = {};
  for (const p of products) {
    const k = (p.name ?? "").trim().toLowerCase();
    if (k) (byName[k] ??= []).push(p);
  }
  const removed = new Set<string>();
  for (const [, group] of Object.entries(byName)) {
    if (group.length < 2) continue;
    const key = `name:${group[0].id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const survivor = group[0];
    const dupes = group.slice(1);
    for (const d of dupes) removed.add(d.id);
    proposals.push({
      change_id: `merge-p-${survivor.id}`,
      op: "merge", severity: "high",
      label: `Merge ${dupes.length + 1} duplicates of "${survivor.name}"`,
      detail: "Keeps the oldest entry, deletes the rest. Existing invoices keep their inline copies.",
      payload: { op: "merge", table: "products", survivor_id: survivor.id,
                 duplicate_ids: dupes.map((d) => d.id), fk_columns: [] },
    });
  }

  // Archive zero-priced empty rows
  for (const p of products) {
    if (removed.has(p.id)) continue;
    if (Number(p.unit_price ?? 0) > 0) continue;
    if (p.description?.trim()) continue;
    proposals.push({
      change_id: `arch-p-${p.id}`, op: "update", severity: "med",
      label: `Archive empty product · ${p.name}`,
      detail: "Zero unit price and no description.",
      payload: { op: "update", table: "products", id: p.id, patch: { archived: true } },
    });
  }

  // Tidy name whitespace
  for (const p of products) {
    if (removed.has(p.id)) continue;
    const trimmed = p.name?.trim();
    if (!trimmed || trimmed === p.name) continue;
    proposals.push({
      change_id: `norm-p-${p.id}`, op: "update", severity: "low",
      label: `Tidy ${p.name}`,
      detail: `Trim whitespace.`,
      payload: { op: "update", table: "products", id: p.id, patch: { name: trimmed } },
    });
  }

  return { proposals, total_rows: products.length };
}

// ─── Work orders ──────────────────────────────────────────────────────────

interface WorkOrderRow {
  id: string; number: string; status: string;
  property_address: string | null;
  scheduled_date: string | null; created_at: string;
}

async function proposeWorkOrdersCleanup() {
  const { rows } = await pullRows("work_orders", "*", false);
  const wos = rows as unknown as WorkOrderRow[];
  const proposals: ProposedChange[] = [];
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

  // Old in-progress jobs (likely abandoned) → flag as needing review.
  for (const wo of wos) {
    if (wo.status !== "in_progress") continue;
    if (new Date(wo.created_at).getTime() > ninetyDaysAgo) continue;
    proposals.push({
      change_id: `cancel-wo-${wo.id}`, op: "update", severity: "med",
      label: `Cancel stale ${wo.number}`,
      detail: "In progress for 90+ days — likely abandoned. Review manually if needed.",
      payload: { op: "update", table: "work_orders", id: wo.id, patch: { status: "cancelled" } },
    });
  }

  // Tidy address whitespace
  for (const wo of wos) {
    const a = wo.property_address?.trim().replace(/\s{2,}/g, " ");
    if (!a || a === wo.property_address) continue;
    proposals.push({
      change_id: `norm-wo-${wo.id}`, op: "update", severity: "low",
      label: `Tidy ${wo.number}`,
      detail: "Collapse extra whitespace in address.",
      payload: { op: "update", table: "work_orders", id: wo.id, patch: { property_address: a } },
    });
  }

  return { proposals, total_rows: wos.length };
}

// ─── Team profiles ────────────────────────────────────────────────────────

interface MemberProfileRow {
  id: string; name: string; email: string;
  is_active: boolean; user_id: string | null;
}

async function proposeTeamProfilesCleanup() {
  const { rows } = await pullRows("member_profiles", "*", false);
  const profiles = rows as unknown as MemberProfileRow[];
  const proposals: ProposedChange[] = [];

  // Dedup by lowercased email
  const byEmail: Record<string, MemberProfileRow[]> = {};
  for (const p of profiles) {
    const k = normEmail(p.email);
    if (k) (byEmail[k] ??= []).push(p);
  }
  const removed = new Set<string>();
  for (const [, group] of Object.entries(byEmail)) {
    if (group.length < 2) continue;
    // Prefer survivor that has user_id set (linked to auth user) over plain profiles.
    group.sort((a, b) => {
      if (!!a.user_id !== !!b.user_id) return a.user_id ? -1 : 1;
      return new Date((a as unknown as { created_at: string }).created_at)
              .getTime() - new Date((b as unknown as { created_at: string }).created_at).getTime();
    });
    const survivor = group[0];
    const dupes = group.slice(1);
    for (const d of dupes) removed.add(d.id);
    proposals.push({
      change_id: `merge-mp-${survivor.id}`,
      op: "merge", severity: "high",
      label: `Merge ${dupes.length + 1} duplicate team profiles: ${survivor.name}`,
      detail: "Keeps the linked-to-auth profile if present; relinks work_orders + assignments.",
      payload: {
        op: "merge", table: "member_profiles",
        survivor_id: survivor.id,
        duplicate_ids: dupes.map((d) => d.id),
        fk_columns: [
          { table: "work_orders",            column: "assigned_to_profile_id" },
          { table: "work_order_assignments", column: "member_profile_id"      },
        ],
      },
    });
  }

  // Tidy name casing/whitespace
  for (const p of profiles) {
    if (removed.has(p.id)) continue;
    const trimmed = p.name?.trim();
    const lowered = p.email?.trim().toLowerCase();
    const patch: Record<string, unknown> = {};
    if (trimmed && trimmed !== p.name) patch.name = trimmed;
    if (lowered && lowered !== p.email) patch.email = lowered;
    if (Object.keys(patch).length === 0) continue;
    proposals.push({
      change_id: `norm-mp-${p.id}`, op: "update", severity: "low",
      label: `Tidy ${p.name}`,
      detail: Object.entries(patch).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · "),
      payload: { op: "update", table: "member_profiles", id: p.id, patch },
    });
  }

  return { proposals, total_rows: profiles.length };
}
