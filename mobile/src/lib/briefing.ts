import { supabase } from "./supabase";

export type BriefingType =
  | "overdue_invoice" | "stale_quote" | "new_lead"
  | "today_job_unassigned" | "submitted_workorder";

export interface BriefingItem {
  id:        string;
  type:      BriefingType;
  priority:  "high" | "med" | "low";
  title:     string;
  subtitle:  string;
  /** Where to send the user when they tap this item. */
  deepLink:  string;
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/** Mirror of web getMyBriefing — returns the active business's
 *  punch-list of overdue invoices, stale quotes, new leads,
 *  unassigned jobs today, and submitted work-orders awaiting review.
 *  RLS scopes to the active business. */
export async function loadBriefing(businessId: string): Promise<BriefingItem[]> {
  const todayStr     = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    { data: invoices }, { data: quotes }, { data: leads },
    { data: jobsToday }, { data: submitted },
  ] = await Promise.all([
    supabase.from("invoices").select("id, number, status, total, amount_paid, due_date, customers(name)")
      .eq("business_id", businessId).in("status", ["sent", "partial", "overdue"]),
    supabase.from("quotes").select("id, number, status, updated_at, customers(name)")
      .eq("business_id", businessId).eq("status", "sent").lt("updated_at", sevenDaysAgo),
    supabase.from("leads").select("id, name, status, created_at")
      .eq("business_id", businessId).eq("status", "new"),
    supabase.from("work_orders").select("id, number, title, status, customers(name), work_order_assignments(member_profile_id)")
      .eq("business_id", businessId).eq("scheduled_date", todayStr),
    supabase.from("work_orders").select("id, number, title, customers(name), updated_at")
      .eq("business_id", businessId).eq("status", "submitted"),
  ]);

  const out: BriefingItem[] = [];
  const now = new Date();

  for (const inv of (invoices ?? []) as unknown as Array<{ id: string; number: string; total: unknown; amount_paid: unknown; due_date: string | null; customers: { name: string } | null }>) {
    if (!inv.due_date || new Date(inv.due_date) >= now) continue;
    const balance = Math.max(0, num(inv.total) - num(inv.amount_paid));
    if (balance < 0.01) continue;
    const days = daysAgo(inv.due_date);
    out.push({
      id: `oi:${inv.id}`, type: "overdue_invoice",
      priority: days > 30 ? "high" : days > 14 ? "med" : "low",
      title:    `${inv.number} · ${days}d overdue`,
      subtitle: `${inv.customers?.name ?? "—"} · ${balance.toFixed(2)}`,
      deepLink: `/invoices/${inv.id}`,
    });
  }

  for (const q of (quotes ?? []) as unknown as Array<{ id: string; number: string; updated_at: string; customers: { name: string } | null }>) {
    const days = daysAgo(q.updated_at);
    out.push({
      id: `sq:${q.id}`, type: "stale_quote",
      priority: days > 14 ? "med" : "low",
      title:    `${q.number} · sent ${days}d ago`,
      subtitle: q.customers?.name ?? "No customer",
      deepLink: `/quotes/${q.id}`,
    });
  }

  for (const l of (leads ?? []) as Array<{ id: string; name: string; created_at: string }>) {
    const days = daysAgo(l.created_at);
    out.push({
      id: `nl:${l.id}`, type: "new_lead",
      priority: days > 2 ? "high" : "med",
      title:    l.name,
      subtitle: days === 0 ? "New today" : `${days}d ago`,
      deepLink: `/leads/${l.id}`,
    });
  }

  for (const j of (jobsToday ?? []) as unknown as Array<{ id: string; number: string; title: string; status: string; customers: { name: string } | null; work_order_assignments: Array<{ member_profile_id: string }> }>) {
    const unassigned = !j.work_order_assignments || j.work_order_assignments.length === 0;
    if (unassigned) {
      out.push({
        id: `tu:${j.id}`, type: "today_job_unassigned",
        priority: "high",
        title:    `${j.number} today`,
        subtitle: `${j.title}${j.customers?.name ? ` · ${j.customers.name}` : ""}`,
        deepLink: `/job/${j.id}`,
      });
    }
  }

  for (const w of (submitted ?? []) as unknown as Array<{ id: string; number: string; title: string; customers: { name: string } | null; updated_at: string }>) {
    const days = daysAgo(w.updated_at);
    out.push({
      id: `sw:${w.id}`, type: "submitted_workorder",
      priority: days > 1 ? "high" : "med",
      title:    `${w.number} submitted`,
      subtitle: `${w.title}${w.customers?.name ? ` · ${w.customers.name}` : ""}`,
      deepLink: `/job/${w.id}`,
    });
  }

  const PRI = { high: 0, med: 1, low: 2 };
  out.sort((a, b) => PRI[a.priority] - PRI[b.priority]);
  return out;
}

export const TYPE_LABEL: Record<BriefingType, string> = {
  overdue_invoice:       "Chase",
  stale_quote:           "Follow up",
  new_lead:              "Call",
  today_job_unassigned:  "Assign",
  submitted_workorder:   "Review",
};

export const PRIORITY_BAR: Record<BriefingItem["priority"], string> = {
  high: "#ef4444",
  med:  "#f59e0b",
  low:  "#60a5fa",
};
