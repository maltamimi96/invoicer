"use server";

/**
 * Per-job profitability: what a job earned vs what it cost.
 *
 *   revenue = invoiced total on linked invoices (and what's actually been paid)
 *   cost    = labour (logged hours × the member's rate)
 *           + materials (qty × unit_cost)
 *           + expenses linked to the job
 *   margin  = revenue - cost
 *
 * Every input is already captured elsewhere in the app — this just brings the
 * four sources together. AI-tool-first: `get_job_profitability` mirrors it.
 */
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface JobProfitability {
  work_order_id: string;
  /** Total of invoices linked to this job. */
  revenue_invoiced: number;
  /** Of that, how much has actually been received. */
  revenue_collected: number;
  labour_cost: number;
  labour_hours: number;
  materials_cost: number;
  expenses_cost: number;
  total_cost: number;
  /** revenue_invoiced - total_cost */
  margin: number;
  /** margin / revenue_invoiced, as a %. Null when nothing is invoiced yet. */
  margin_percent: number | null;
  /** True when some cost inputs are missing rates (labour without a pay rate). */
  has_unrated_labour: boolean;
}

export async function getJobProfitability(workOrderId: string): Promise<JobProfitability> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const [invRes, timeRes, matRes, expRes, memRes] = await Promise.all([
    tbl(supabase, "invoices").select("total, amount_paid")
      .eq("business_id", businessId).eq("work_order_id", workOrderId),
    tbl(supabase, "job_time_entries").select("user_id, member_profile_id, duration_seconds, type")
      .eq("business_id", businessId).eq("work_order_id", workOrderId),
    tbl(supabase, "job_materials").select("qty, unit_cost")
      .eq("business_id", businessId).eq("work_order_id", workOrderId),
    tbl(supabase, "expenses").select("amount, tax_amount")
      .eq("business_id", businessId).eq("work_order_id", workOrderId),
    tbl(supabase, "member_profiles").select("id, user_id, hourly_rate").eq("business_id", businessId),
  ]);

  // Rate lookup by both member id and user id — time entries carry either.
  const rateByMember = new Map<string, number | null>();
  const rateByUser = new Map<string, number | null>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (memRes.data ?? []) as any[]) {
    const rate = m.hourly_rate != null ? num(m.hourly_rate) : null;
    rateByMember.set(m.id, rate);
    if (m.user_id) rateByUser.set(m.user_id, rate);
  }

  let labour_cost = 0, labour_hours = 0, has_unrated_labour = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (timeRes.data ?? []) as any[]) {
    if (e.type === "break") continue;              // breaks aren't paid time
    const hrs = num(e.duration_seconds) / 3600;
    if (hrs <= 0) continue;
    labour_hours += hrs;
    const rate =
      (e.member_profile_id ? rateByMember.get(e.member_profile_id) : undefined) ??
      (e.user_id ? rateByUser.get(e.user_id) : undefined) ?? null;
    if (rate == null) has_unrated_labour = true;
    else labour_cost += hrs * rate;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const materials_cost = ((matRes.data ?? []) as any[])
    .reduce((s, m) => s + num(m.qty) * num(m.unit_cost), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenses_cost = ((expRes.data ?? []) as any[])
    .reduce((s, e) => s + num(e.amount) + num(e.tax_amount), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (invRes.data ?? []) as any[];
  const revenue_invoiced = invoices.reduce((s, i) => s + num(i.total), 0);
  const revenue_collected = invoices.reduce((s, i) => s + num(i.amount_paid), 0);

  const total_cost = labour_cost + materials_cost + expenses_cost;
  const margin = revenue_invoiced - total_cost;

  return {
    work_order_id: workOrderId,
    revenue_invoiced: round2(revenue_invoiced),
    revenue_collected: round2(revenue_collected),
    labour_cost: round2(labour_cost),
    labour_hours: round2(labour_hours),
    materials_cost: round2(materials_cost),
    expenses_cost: round2(expenses_cost),
    total_cost: round2(total_cost),
    margin: round2(margin),
    margin_percent: revenue_invoiced > 0 ? Math.round((margin / revenue_invoiced) * 100) : null,
    has_unrated_labour,
  };
}
