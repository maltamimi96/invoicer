import { supabase } from "./supabase";

/**
 * Snapshot of the active business's state — recent records, stats, today's
 * jobs — that the AI assistant uses to resolve pronouns ("that customer",
 * "the invoice we just made", "today's jobs") without needing the user to
 * spell out IDs.
 *
 * Fetched fresh on every chat send so it reflects what the user has just
 * been doing in the app.
 */
export interface AgentSnapshot {
  business:        { id: string; name: string; currency: string };
  stats:           {
    outstanding:    number;
    overdue:        number;
    jobs_today:     number;
    draft_quotes:   number;
    new_leads_7d:   number;
  };
  recent_customers: Array<{ id: string; name: string; company: string | null }>;
  recent_invoices:  Array<{ id: string; number: string; status: string; total: number; balance: number; customer_name: string | null }>;
  recent_quotes:    Array<{ id: string; number: string; status: string; total: number; customer_name: string | null }>;
  todays_jobs:      Array<{ id: string; number: string; title: string; status: string; customer_name: string | null }>;
  open_leads:       Array<{ id: string; name: string; status: string; created_at: string }>;
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Pull everything in parallel. RLS scopes to the active business. */
export async function fetchAgentSnapshot(
  businessId: string,
  businessName: string,
  currency: string,
): Promise<AgentSnapshot> {
  const today    = new Date().toISOString().split("T")[0];
  const weekAgo  = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    { data: invoiceStats }, { data: jobsTodayCount }, { data: draftQuoteCount },
    { data: newLeadCount },
    { data: recentCustomers }, { data: recentInvoices }, { data: recentQuotes },
    { data: todaysJobs }, { data: openLeads },
  ] = await Promise.all([
    supabase.from("invoices")
      .select("status, total, amount_paid, due_date")
      .eq("business_id", businessId)
      .in("status", ["sent", "partial", "overdue"]),
    supabase.from("work_orders").select("id").eq("business_id", businessId).eq("scheduled_date", today),
    supabase.from("quotes").select("id").eq("business_id", businessId).eq("status", "draft"),
    supabase.from("leads").select("id").eq("business_id", businessId).gte("created_at", weekAgo),

    supabase.from("customers")
      .select("id, name, company")
      .eq("business_id", businessId).eq("archived", false)
      .order("updated_at", { ascending: false }).limit(8),

    supabase.from("invoices")
      .select("id, number, status, total, amount_paid, customers(name)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }).limit(8),

    supabase.from("quotes")
      .select("id, number, status, total, customers(name)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }).limit(8),

    supabase.from("work_orders")
      .select("id, number, title, status, customers(name)")
      .eq("business_id", businessId).eq("scheduled_date", today)
      .order("scheduled_date", { ascending: true }).limit(8),

    supabase.from("leads")
      .select("id, name, status, created_at")
      .eq("business_id", businessId).eq("status", "new")
      .order("created_at", { ascending: false }).limit(8),
  ]);

  // Compute stats
  const now = new Date();
  let outstanding = 0, overdue = 0;
  for (const inv of (invoiceStats ?? []) as Array<{ total: unknown; amount_paid: unknown; due_date: string | null }>) {
    const bal = Math.max(0, num(inv.total) - num(inv.amount_paid));
    outstanding += bal;
    if (inv.due_date && new Date(inv.due_date) < now) overdue += bal;
  }

  const nameOf = (row: unknown): string | null => {
    const cust = (row as { customers?: unknown }).customers;
    if (!cust) return null;
    if (Array.isArray(cust)) return (cust[0] as { name?: string } | undefined)?.name ?? null;
    return (cust as { name?: string }).name ?? null;
  };

  return {
    business: { id: businessId, name: businessName, currency },
    stats: {
      outstanding,
      overdue,
      jobs_today:   (jobsTodayCount  ?? []).length,
      draft_quotes: (draftQuoteCount ?? []).length,
      new_leads_7d: (newLeadCount    ?? []).length,
    },
    recent_customers: ((recentCustomers ?? []) as Array<{ id: string; name: string; company: string | null }>),
    recent_invoices:  ((recentInvoices ?? []) as Array<{ id: string; number: string; status: string; total: unknown; amount_paid: unknown }>)
      .map((i) => ({
        id: i.id, number: i.number, status: i.status,
        total: num(i.total),
        balance: Math.max(0, num(i.total) - num(i.amount_paid)),
        customer_name: nameOf(i),
      })),
    recent_quotes: ((recentQuotes ?? []) as Array<{ id: string; number: string; status: string; total: unknown }>)
      .map((q) => ({ id: q.id, number: q.number, status: q.status, total: num(q.total), customer_name: nameOf(q) })),
    todays_jobs: ((todaysJobs ?? []) as Array<{ id: string; number: string; title: string; status: string }>)
      .map((w) => ({ id: w.id, number: w.number, title: w.title, status: w.status, customer_name: nameOf(w) })),
    open_leads: ((openLeads ?? []) as Array<{ id: string; name: string; status: string; created_at: string }>),
  };
}
