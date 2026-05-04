"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export type AnalyticsRange = "30d" | "90d" | "12m" | "ytd";

export interface AnalyticsPayload {
  range: { from: string; to: string; label: string };
  currency: string;
  totals: {
    revenue: number;
    invoiced: number;
    outstanding: number;
    overdue: number;
    paid_count: number;
    avg_invoice_value: number;
    revenue_delta_pct: number | null;
  };
  /** Last 12 months always — chart needs the full window regardless of range filter. */
  monthly: { month: string; revenue: number; invoiced: number }[];
  top_customers: { id: string; name: string; total_billed: number; invoice_count: number }[];
  quote_funnel: { draft: number; sent: number; accepted: number; rejected: number; expired: number };
  ar_aging: { current: number; b30: number; b60: number; b90: number; b90plus: number };
  lead_funnel: { new: number; contacted: number; quoted: number; won: number; lost: number };
  job_status: Record<string, number>;
}

function rangeBounds(range: AnalyticsRange): { from: Date; to: Date; label: string } {
  const to = new Date();
  const from = new Date();
  let label = "";
  switch (range) {
    case "30d": from.setDate(to.getDate() - 30); label = "Last 30 days"; break;
    case "90d": from.setDate(to.getDate() - 90); label = "Last 90 days"; break;
    case "12m": from.setMonth(to.getMonth() - 12); label = "Last 12 months"; break;
    case "ytd": from.setMonth(0, 1); from.setHours(0, 0, 0, 0); label = "Year to date"; break;
  }
  return { from, to, label };
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

export async function getBusinessAnalytics(range: AnalyticsRange = "90d"): Promise<AnalyticsPayload> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { from, to, label } = rangeBounds(range);
  const fromIso = from.toISOString();
  const toIso   = to.toISOString();

  // Pull everything in parallel — small businesses, all-rows is cheap.
  const [
    { data: invoicesRaw },
    { data: quotesRaw },
    { data: leadsRaw },
    { data: workOrdersRaw },
    { data: customersRaw },
    { data: business },
  ] = await Promise.all([
    tbl(supabase, "invoices")
      .select("id, customer_id, total, amount_paid, status, issue_date, due_date, created_at, customers(name)")
      .eq("business_id", businessId),
    tbl(supabase, "quotes")
      .select("id, status, total, created_at")
      .eq("business_id", businessId),
    tbl(supabase, "leads")
      .select("id, status, created_at")
      .eq("business_id", businessId),
    tbl(supabase, "work_orders")
      .select("id, status, created_at")
      .eq("business_id", businessId),
    tbl(supabase, "customers")
      .select("id, name")
      .eq("business_id", businessId)
      .eq("archived", false),
    tbl(supabase, "businesses").select("currency").eq("id", businessId).maybeSingle(),
  ]);

  const invoices = (invoicesRaw ?? []) as Array<{
    id: string; customer_id: string | null; total: unknown; amount_paid: unknown;
    status: string; issue_date: string | null; due_date: string | null; created_at: string;
    customers: { name: string } | null;
  }>;
  const quotes  = (quotesRaw ?? []) as Array<{ status: string; total: unknown; created_at: string }>;
  const leads   = (leadsRaw ?? []) as Array<{ status: string; created_at: string }>;
  const wos     = (workOrdersRaw ?? []) as Array<{ status: string }>;
  const customers = (customersRaw ?? []) as Array<{ id: string; name: string }>;

  // ─── Totals (in range) ─────────────────────────────────────────────────
  const inRange = (iso: string) => iso >= fromIso && iso <= toIso;
  const today   = new Date();

  let revenue = 0, invoiced = 0, outstanding = 0, overdue = 0, paidCount = 0;
  for (const inv of invoices) {
    const total = num(inv.total);
    const paid  = num(inv.amount_paid);
    const created = inv.created_at;
    const isPaid  = inv.status === "paid";
    const isOpen  = ["sent", "partial", "overdue"].includes(inv.status);

    if (inRange(created)) {
      invoiced += total;
      if (isPaid) { revenue += total; paidCount += 1; }
    }
    if (isOpen) {
      outstanding += Math.max(0, total - paid);
      if (inv.due_date && new Date(inv.due_date) < today) {
        overdue += Math.max(0, total - paid);
      }
    }
  }
  const avgInvoiceValue = paidCount > 0 ? revenue / paidCount : 0;

  // Revenue delta vs prior equal-length window
  const windowMs   = to.getTime() - from.getTime();
  const priorFrom  = new Date(from.getTime() - windowMs).toISOString();
  const priorTo    = fromIso;
  const priorRevenue = invoices
    .filter((i) => i.status === "paid" && i.created_at >= priorFrom && i.created_at < priorTo)
    .reduce((s, i) => s + num(i.total), 0);
  const revenue_delta_pct = priorRevenue > 0
    ? Math.round(((revenue - priorRevenue) / priorRevenue) * 1000) / 10
    : null;

  // ─── Monthly trailing 12mo ─────────────────────────────────────────────
  const monthly: { month: string; revenue: number; invoiced: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleString("default", { month: "short" });
    const monthStart = d.getTime();
    const monthEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    let mRev = 0, mBilled = 0;
    for (const inv of invoices) {
      const t = new Date(inv.created_at).getTime();
      if (t >= monthStart && t < monthEnd) {
        const amt = num(inv.total);
        mBilled += amt;
        if (inv.status === "paid") mRev += amt;
      }
    }
    monthly.push({ month: key, revenue: mRev, invoiced: mBilled });
  }

  // ─── Top 5 customers (lifetime revenue) ────────────────────────────────
  const customerTotals = new Map<string, { id: string; name: string; total_billed: number; invoice_count: number }>();
  for (const c of customers) {
    customerTotals.set(c.id, { id: c.id, name: c.name, total_billed: 0, invoice_count: 0 });
  }
  for (const inv of invoices) {
    if (!inv.customer_id) continue;
    const row = customerTotals.get(inv.customer_id);
    if (!row) continue;
    if (inv.status === "cancelled" || inv.status === "draft") continue;
    row.total_billed += num(inv.total);
    row.invoice_count += 1;
  }
  const top_customers = [...customerTotals.values()]
    .filter((r) => r.invoice_count > 0)
    .sort((a, b) => b.total_billed - a.total_billed)
    .slice(0, 5);

  // ─── Quote funnel (in range) ───────────────────────────────────────────
  const quote_funnel = { draft: 0, sent: 0, accepted: 0, rejected: 0, expired: 0 };
  for (const q of quotes) {
    if (!inRange(q.created_at)) continue;
    if (q.status in quote_funnel) (quote_funnel as Record<string, number>)[q.status] += 1;
  }

  // ─── A/R aging (open invoices only, by days past due) ──────────────────
  const ar_aging = { current: 0, b30: 0, b60: 0, b90: 0, b90plus: 0 };
  for (const inv of invoices) {
    if (!["sent", "partial", "overdue"].includes(inv.status)) continue;
    if (!inv.due_date) continue;
    const balance = Math.max(0, num(inv.total) - num(inv.amount_paid));
    if (balance <= 0) continue;
    const daysPast = Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / 86_400_000);
    if      (daysPast <= 0)  ar_aging.current += balance;
    else if (daysPast <= 30) ar_aging.b30     += balance;
    else if (daysPast <= 60) ar_aging.b60     += balance;
    else if (daysPast <= 90) ar_aging.b90     += balance;
    else                     ar_aging.b90plus += balance;
  }

  // ─── Lead funnel (in range) ───────────────────────────────────────────
  const lead_funnel = { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 };
  for (const l of leads) {
    if (!inRange(l.created_at)) continue;
    if (l.status in lead_funnel) (lead_funnel as Record<string, number>)[l.status] += 1;
  }

  // ─── Job status counts (all-time) ─────────────────────────────────────
  const job_status: Record<string, number> = {};
  for (const w of wos) job_status[w.status] = (job_status[w.status] ?? 0) + 1;

  return {
    range: { from: fromIso, to: toIso, label },
    currency: (business as { currency?: string } | null)?.currency ?? "GBP",
    totals: {
      revenue,
      invoiced,
      outstanding,
      overdue,
      paid_count: paidCount,
      avg_invoice_value: Math.round(avgInvoiceValue * 100) / 100,
      revenue_delta_pct,
    },
    monthly,
    top_customers,
    quote_funnel,
    ar_aging,
    lead_funnel,
    job_status,
  };
}
