"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";

import { getUser } from "@/lib/auth";
export type BriefingType =
  | "overdue_invoice"
  | "stale_quote"
  | "draft_quote"
  | "new_lead"
  | "stale_lead"
  | "job_today_unassigned"
  | "job_today"
  | "submitted_workorder"
  | "completed_unbilled";

export type BriefingPriority = "high" | "med" | "low";

export interface BriefingItem {
  id:            string;          // synthetic: `${type}:${entity_id}`
  type:          BriefingType;
  priority:      BriefingPriority;
  title:         string;
  subtitle:      string;
  action_label:  string;
  action_url:    string;
  entity_type:   "invoice" | "quote" | "lead" | "work_order" | "customer";
  entity_id:     string;
  age_days:      number;
  amount?:       number;
  customer_name?: string;
}

export interface BriefingSummary {
  items: BriefingItem[];
  counts: Record<BriefingType, number>;
  generated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);
const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0; };
const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/** Fetches active dismissals for this user, returning a fast lookup set
 *  keyed `${type}:${entity_id}` so the briefing builder can filter. */
async function loadDismissalKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, businessId: string, userId: string,
): Promise<Set<string>> {
  const nowIso = new Date().toISOString();
  const { data } = await tbl(sb, "briefing_dismissals")
    .select("briefing_type, entity_id, snoozed_until, dismissed")
    .eq("business_id", businessId)
    .eq("user_id", userId);
  const keys = new Set<string>();
  for (const row of (data ?? []) as Array<{ briefing_type: string; entity_id: string; snoozed_until: string | null; dismissed: boolean }>) {
    const stillActive = row.dismissed || (row.snoozed_until && row.snoozed_until > nowIso);
    if (stillActive) keys.add(`${row.briefing_type}:${row.entity_id}`);
  }
  return keys;
}

/** Compose the briefing. Reads live data each time (no scheduled job needed)
 *  and applies per-user dismissals/snoozes. */
export async function getMyBriefing(): Promise<BriefingSummary> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  return _buildBriefing(supabase, businessId, user.id);
}

/** Internal — also callable from the cron (admin client) by passing a user id. */
async function _buildBriefing(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, businessId: string, userId: string,
): Promise<BriefingSummary> {
  const todayStr = new Date().toISOString().split("T")[0];
  const sevenDaysAgo  = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const threeDaysAgo  = new Date(Date.now() - 3 * 86_400_000).toISOString();

  const [
    { data: invoices },
    { data: quotes },
    { data: leads },
    { data: jobsToday },
    { data: jobsSubmitted },
    { data: jobsCompletedUnbilled },
    dismissals,
  ] = await Promise.all([
    tbl(sb, "invoices")
      .select("id, number, status, total, amount_paid, due_date, customers(id, name)")
      .eq("business_id", businessId)
      .in("status", ["sent", "partial", "overdue"]),
    tbl(sb, "quotes")
      .select("id, number, status, total, created_at, updated_at, customers(id, name)")
      .eq("business_id", businessId)
      .in("status", ["draft", "sent"]),
    tbl(sb, "leads")
      .select("id, name, status, created_at")
      .eq("business_id", businessId)
      .in("status", ["new", "contacted"]),
    tbl(sb, "work_orders")
      .select("id, number, title, status, scheduled_date, customers(id, name), work_order_assignments(member_profile_id)")
      .eq("business_id", businessId)
      .eq("scheduled_date", todayStr)
      .in("status", ["draft", "assigned", "in_progress"]),
    tbl(sb, "work_orders")
      .select("id, number, title, status, customers(id, name), updated_at")
      .eq("business_id", businessId)
      .eq("status", "submitted"),
    tbl(sb, "work_orders")
      .select("id, number, title, status, customers(id, name), updated_at")
      .eq("business_id", businessId)
      .eq("status", "completed")
      .gte("updated_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
    loadDismissalKeys(sb, businessId, userId),
  ]);

  const items: BriefingItem[] = [];
  const today = new Date();

  // ── Overdue invoices ────────────────────────────────────────────────────
  for (const inv of (invoices ?? []) as Array<{ id: string; number: string; status: string; total: unknown; amount_paid: unknown; due_date: string | null; customers: { id: string; name: string } | null }>) {
    if (!inv.due_date || new Date(inv.due_date) >= today) continue;
    const balance = Math.max(0, num(inv.total) - num(inv.amount_paid));
    if (balance < 0.01) continue;
    const days = daysAgo(inv.due_date);
    const priority: BriefingPriority = days > 30 ? "high" : days > 14 ? "med" : "low";
    items.push({
      id: `overdue_invoice:${inv.id}`,
      type: "overdue_invoice",
      priority,
      title: `Chase ${inv.number} · ${days}d overdue`,
      subtitle: `${inv.customers?.name ?? "—"} · balance ${balance.toFixed(2)}`,
      action_label: "Open invoice",
      action_url: `/invoices/${inv.id}`,
      entity_type: "invoice",
      entity_id: inv.id,
      age_days: days,
      amount: balance,
      customer_name: inv.customers?.name,
    });
  }

  // ── Stale quotes (sent > 7 days, no response) ───────────────────────────
  for (const q of (quotes ?? []) as Array<{ id: string; number: string; status: string; total: unknown; created_at: string; updated_at: string; customers: { id: string; name: string } | null }>) {
    if (q.status === "sent" && q.updated_at < sevenDaysAgo) {
      const days = daysAgo(q.updated_at);
      items.push({
        id: `stale_quote:${q.id}`,
        type: "stale_quote",
        priority: days > 14 ? "med" : "low",
        title: `Follow up on ${q.number} · sent ${days}d ago`,
        subtitle: `${q.customers?.name ?? "—"} · ${num(q.total).toFixed(2)}`,
        action_label: "Open quote",
        action_url: `/quotes/${q.id}`,
        entity_type: "quote",
        entity_id: q.id,
        age_days: days,
        amount: num(q.total),
        customer_name: q.customers?.name,
      });
    } else if (q.status === "draft" && q.created_at < threeDaysAgo) {
      const days = daysAgo(q.created_at);
      items.push({
        id: `draft_quote:${q.id}`,
        type: "draft_quote",
        priority: "low",
        title: `Send draft ${q.number} · sitting ${days}d`,
        subtitle: `${q.customers?.name ?? "no customer set"}`,
        action_label: "Open draft",
        action_url: `/quotes/${q.id}`,
        entity_type: "quote",
        entity_id: q.id,
        age_days: days,
        amount: num(q.total),
        customer_name: q.customers?.name,
      });
    }
  }

  // ── Leads needing first contact ─────────────────────────────────────────
  for (const l of (leads ?? []) as Array<{ id: string; name: string; status: string; created_at: string }>) {
    const days = daysAgo(l.created_at);
    if (l.status === "new") {
      items.push({
        id: `new_lead:${l.id}`,
        type: "new_lead",
        priority: days > 2 ? "high" : "med",
        title: `Reach out to lead · ${l.name}`,
        subtitle: `New ${days === 0 ? "today" : `${days}d ago`}`,
        action_label: "Open lead",
        action_url: `/leads/${l.id}`,
        entity_type: "lead",
        entity_id: l.id,
        age_days: days,
        customer_name: l.name,
      });
    } else if (l.status === "contacted" && days > 5) {
      items.push({
        id: `stale_lead:${l.id}`,
        type: "stale_lead",
        priority: "low",
        title: `Re-engage lead · ${l.name}`,
        subtitle: `Contacted ${days}d ago, no movement`,
        action_label: "Open lead",
        action_url: `/leads/${l.id}`,
        entity_type: "lead",
        entity_id: l.id,
        age_days: days,
        customer_name: l.name,
      });
    }
  }

  // ── Today's jobs (with unassigned warning) ──────────────────────────────
  for (const j of (jobsToday ?? []) as Array<{ id: string; number: string; title: string; status: string; scheduled_date: string; customers: { id: string; name: string } | null; work_order_assignments: Array<{ member_profile_id: string }> }>) {
    const unassigned = !j.work_order_assignments || j.work_order_assignments.length === 0;
    items.push({
      id: `${unassigned ? "job_today_unassigned" : "job_today"}:${j.id}`,
      type: unassigned ? "job_today_unassigned" : "job_today",
      priority: unassigned ? "high" : "med",
      title: unassigned ? `Assign worker · ${j.number}` : `Today · ${j.number}`,
      subtitle: `${j.title}${j.customers?.name ? ` · ${j.customers.name}` : ""}`,
      action_label: unassigned ? "Assign" : "Open job",
      action_url: `/work-orders/${j.id}`,
      entity_type: "work_order",
      entity_id: j.id,
      age_days: 0,
      customer_name: j.customers?.name,
    });
  }

  // ── Submitted work orders waiting for review ───────────────────────────
  for (const w of (jobsSubmitted ?? []) as Array<{ id: string; number: string; title: string; customers: { id: string; name: string } | null; updated_at: string }>) {
    const days = daysAgo(w.updated_at);
    items.push({
      id: `submitted_workorder:${w.id}`,
      type: "submitted_workorder",
      priority: days > 1 ? "high" : "med",
      title: `Review ${w.number} · submitted ${days === 0 ? "today" : `${days}d ago`}`,
      subtitle: `${w.title}${w.customers?.name ? ` · ${w.customers.name}` : ""}`,
      action_label: "Review",
      action_url: `/work-orders/${w.id}`,
      entity_type: "work_order",
      entity_id: w.id,
      age_days: days,
      customer_name: w.customers?.name,
    });
  }

  // ── Completed jobs not yet invoiced ────────────────────────────────────
  // We rely on the work_order_financials view for "is invoiced" but that's
  // expensive — instead, surface completed jobs from the last 30d and let
  // the user decide.
  for (const w of (jobsCompletedUnbilled ?? []) as Array<{ id: string; number: string; title: string; customers: { id: string; name: string } | null; updated_at: string }>) {
    const days = daysAgo(w.updated_at);
    if (days < 1) continue; // give yourself the day to wrap up
    items.push({
      id: `completed_unbilled:${w.id}`,
      type: "completed_unbilled",
      priority: days > 7 ? "high" : "low",
      title: `Invoice ${w.number} · completed ${days}d ago`,
      subtitle: `${w.title}${w.customers?.name ? ` · ${w.customers.name}` : ""}`,
      action_label: "Open job",
      action_url: `/work-orders/${w.id}`,
      entity_type: "work_order",
      entity_id: w.id,
      age_days: days,
      customer_name: w.customers?.name,
    });
  }

  // Filter out dismissed items + sort by priority then age.
  const visible = items.filter((i) => !dismissals.has(`${i.type}:${i.entity_id}`));
  const PRI: Record<BriefingPriority, number> = { high: 0, med: 1, low: 2 };
  visible.sort((a, b) => (PRI[a.priority] - PRI[b.priority]) || (b.age_days - a.age_days));

  const counts: Record<BriefingType, number> = {
    overdue_invoice: 0, stale_quote: 0, draft_quote: 0,
    new_lead: 0, stale_lead: 0,
    job_today: 0, job_today_unassigned: 0,
    submitted_workorder: 0, completed_unbilled: 0,
  };
  for (const i of visible) counts[i.type] += 1;

  return { items: visible, counts, generated_at: new Date().toISOString() };
}

/** Hide an item from this user's briefing. `hours` = 0 means dismiss forever. */
export async function snoozeBriefingItem(input: {
  briefing_type: BriefingType;
  entity_id: string;
  hours: number;
}): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const snoozedUntil = input.hours > 0
    ? new Date(Date.now() + input.hours * 3_600_000).toISOString()
    : null;
  const dismissed = input.hours === 0;

  // Upsert by (business, user, type, entity)
  const { error } = await tbl(supabase, "briefing_dismissals").upsert({
    business_id: businessId,
    user_id: user.id,
    briefing_type: input.briefing_type,
    entity_id: input.entity_id,
    snoozed_until: snoozedUntil,
    dismissed,
    updated_at: new Date().toISOString(),
  }, { onConflict: "business_id,user_id,briefing_type,entity_id" });
  if (error) throw error;

  revalidatePath("/dashboard");
  revalidatePath("/assistant");
}

/** Internal helper used by the daily-digest cron — resolves a briefing for
 *  any user without needing their session. */
export async function getBriefingForUser(userId: string, businessId: string): Promise<BriefingSummary> {
  const sb = createAdminClient();
  return _buildBriefing(sb, businessId, userId);
}
