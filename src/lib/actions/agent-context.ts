"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";

export interface AgentContextPacket {
  business: { name: string; currency: string; phone: string | null; email: string | null; license_number: string | null };
  current_page: string;
  recent_customers: Array<{ id: string; name: string; company: string | null }>;
  recent_invoices: Array<{ id: string; number: string; status: string; total: number; balance: number; customer_name: string | null }>;
  recent_quotes:   Array<{ id: string; number: string; status: string; total: number; customer_name: string | null }>;
  todays_jobs:     Array<{ id: string; number: string; title: string; status: string; customer_name: string | null; scheduled_date: string | null }>;
  open_leads:      Array<{ id: string; name: string; status: string; created_at: string }>;
  stats: {
    outstanding: number;
    overdue: number;
    jobs_today: number;
    jobs_this_week: number;
    draft_quotes: number;
    new_leads_7d: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);
const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0; };

/** Build a snapshot of what the user is likely thinking about right now.
 *  Sent with every AI assistant request so the agent has live context.
 *  Keep this lightweight — it runs on every chat turn. */
export async function getAgentContext(currentPage = "/"): Promise<AgentContextPacket> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const today    = new Date().toISOString().split("T")[0];
  const weekAgo  = new Date(Date.now() - 7  * 86_400_000).toISOString();
  const weekHead = new Date(Date.now() + 7  * 86_400_000).toISOString().split("T")[0];

  const [
    { data: business },
    { data: customers },
    { data: invoices },
    { data: quotes },
    { data: jobs },
    { data: leads },
  ] = await Promise.all([
    tbl(supabase, "businesses")
      .select("name, currency, phone, email, license_number")
      .eq("id", businessId)
      .maybeSingle(),
    tbl(supabase, "customers")
      .select("id, name, company")
      .eq("business_id", businessId)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(8),
    tbl(supabase, "invoices")
      .select("id, number, status, total, amount_paid, customers(name)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(10),
    tbl(supabase, "quotes")
      .select("id, number, status, total, customers(name)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(8),
    tbl(supabase, "work_orders")
      .select("id, number, title, status, scheduled_date, customers(name)")
      .eq("business_id", businessId)
      .gte("scheduled_date", today)
      .lte("scheduled_date", weekHead)
      .order("scheduled_date", { ascending: true })
      .limit(15),
    tbl(supabase, "leads")
      .select("id, name, status, created_at")
      .eq("business_id", businessId)
      .gte("created_at", weekAgo)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const invs = (invoices ?? []) as Array<{ id: string; number: string; status: string; total: unknown; amount_paid: unknown; customers: { name: string } | null }>;
  const qts  = (quotes   ?? []) as Array<{ id: string; number: string; status: string; total: unknown; customers: { name: string } | null }>;
  const wos  = (jobs     ?? []) as Array<{ id: string; number: string; title: string; status: string; scheduled_date: string | null; customers: { name: string } | null }>;
  const lds  = (leads    ?? []) as Array<{ id: string; name: string; status: string; created_at: string }>;

  // Derived stats
  const outstanding = invs
    .filter((i) => ["sent", "partial", "overdue"].includes(i.status))
    .reduce((s, i) => s + Math.max(0, num(i.total) - num(i.amount_paid)), 0);
  const overdue = invs
    .filter((i) => i.status === "overdue")
    .reduce((s, i) => s + Math.max(0, num(i.total) - num(i.amount_paid)), 0);

  return {
    business: {
      name:           (business as { name?: string } | null)?.name ?? "your business",
      currency:       (business as { currency?: string } | null)?.currency ?? "AUD",
      phone:          (business as { phone?: string } | null)?.phone ?? null,
      email:          (business as { email?: string } | null)?.email ?? null,
      license_number: (business as { license_number?: string } | null)?.license_number ?? null,
    },
    current_page: currentPage,
    recent_customers: ((customers ?? []) as Array<{ id: string; name: string; company: string | null }>),
    recent_invoices: invs.map((i) => ({
      id: i.id, number: i.number, status: i.status,
      total: num(i.total),
      balance: Math.max(0, num(i.total) - num(i.amount_paid)),
      customer_name: i.customers?.name ?? null,
    })),
    recent_quotes: qts.map((q) => ({
      id: q.id, number: q.number, status: q.status,
      total: num(q.total),
      customer_name: q.customers?.name ?? null,
    })),
    todays_jobs: wos.map((w) => ({
      id: w.id, number: w.number, title: w.title, status: w.status,
      scheduled_date: w.scheduled_date,
      customer_name: w.customers?.name ?? null,
    })),
    open_leads: lds,
    stats: {
      outstanding,
      overdue,
      jobs_today: wos.filter((w) => w.scheduled_date === today).length,
      jobs_this_week: wos.length,
      draft_quotes: qts.filter((q) => q.status === "draft").length,
      new_leads_7d: lds.length,
    },
  };
}
