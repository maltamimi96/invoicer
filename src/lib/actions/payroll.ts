"use server";

/**
 * Payroll plugin. Employees + pay runs; gross from hours×rate or salary, super
 * as a %, manual tax. Finalising a run posts wages + super to Expenses so
 * business spend / P&L include payroll. AI-tool-first (scopes payroll:read /
 * payroll:write). Sensitive — RLS restricts to non-worker members.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import type { PayrollEmployee, PayRun, PayRunLine, PayType } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

// ── Employees ────────────────────────────────────────────────────────────────

export async function listEmployees(includeInactive = false): Promise<PayrollEmployee[]> {
  const { supabase, businessId } = await ctx();
  let q = tbl(supabase, "payroll_employees").select("*").eq("business_id", businessId).order("name");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data as PayrollEmployee[];
}

export async function createEmployee(input: {
  name: string; email?: string | null; member_profile_id?: string | null;
  pay_type?: PayType; hourly_rate?: number; annual_salary?: number; super_rate?: number;
}): Promise<PayrollEmployee> {
  const { supabase, businessId } = await ctx();
  if (!input.name?.trim()) throw new Error("Name is required");
  const { data, error } = await tbl(supabase, "payroll_employees").insert({
    business_id: businessId,
    name: input.name.trim(),
    email: input.email?.trim() || null,
    member_profile_id: input.member_profile_id || null,
    pay_type: input.pay_type ?? "hourly",
    hourly_rate: num(input.hourly_rate),
    annual_salary: num(input.annual_salary),
    super_rate: input.super_rate != null ? num(input.super_rate) : 11.5,
  }).select().single();
  if (error) throw error;
  revalidatePath("/payroll");
  return data as PayrollEmployee;
}

export async function updateEmployee(id: string, patch: Partial<Omit<PayrollEmployee, "id" | "business_id" | "created_at" | "updated_at">>): Promise<void> {
  const { supabase, businessId } = await ctx();
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const { error } = await tbl(supabase, "payroll_employees").update(clean).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/payroll");
}

export async function deleteEmployee(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  // Soft archive — past pay-run lines snapshot the name, so history is safe.
  const { error } = await tbl(supabase, "payroll_employees").update({ active: false }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/payroll");
}

// ── Pay runs ──────────────────────────────────────────────────────────────────

export async function listPayRuns(): Promise<PayRun[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "pay_runs").select("*").eq("business_id", businessId).order("pay_date", { ascending: false });
  if (error) throw error;
  return data as PayRun[];
}

export async function getPayRun(id: string): Promise<{ run: PayRun; lines: PayRunLine[] }> {
  const { supabase, businessId } = await ctx();
  const [runRes, linesRes] = await Promise.all([
    tbl(supabase, "pay_runs").select("*").eq("id", id).eq("business_id", businessId).single(),
    tbl(supabase, "pay_run_lines").select("*").eq("pay_run_id", id).eq("business_id", businessId).order("name"),
  ]);
  if (runRes.error) throw runRes.error;
  return { run: runRes.data as PayRun, lines: (linesRes.data ?? []) as PayRunLine[] };
}

/** Sum logged job-time hours per member (by user_id) within [start, end]. */
async function hoursByUser(supabase: unknown, businessId: string, start: string, end: string): Promise<Map<string, number>> {
  const endExclusive = new Date(new Date(end + "T00:00:00Z").getTime() + 86400000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await tbl(supabase as any, "job_time_entries")
    .select("user_id, duration_seconds, type")
    .eq("business_id", businessId)
    .gte("started_at", start + "T00:00:00Z")
    .lt("started_at", endExclusive);
  const map = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (data ?? []) as any[]) {
    if (e.type === "break" || !e.user_id) continue;
    map.set(e.user_id, (map.get(e.user_id) ?? 0) + num(e.duration_seconds) / 3600);
  }
  return map;
}

/** Create a draft pay run and pre-fill a line per active employee (hourly lines
 *  seeded from logged hours; salary lines pro-rated over the period). */
export async function createPayRun(input: { period_start: string; period_end: string; pay_date?: string; notes?: string | null }): Promise<PayRun> {
  const { supabase, businessId } = await ctx();
  const { data: run, error } = await tbl(supabase, "pay_runs").insert({
    business_id: businessId,
    period_start: input.period_start,
    period_end: input.period_end,
    pay_date: input.pay_date || input.period_end,
    notes: input.notes ?? null,
  }).select().single();
  if (error) throw error;

  const employees = await listEmployees();
  const memberIds = employees.map((e) => e.member_profile_id).filter(Boolean) as string[];
  const memberUserId = new Map<string, string>();
  if (memberIds.length) {
    const { data: members } = await tbl(supabase, "member_profiles").select("id, user_id").in("id", memberIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (members ?? []) as any[]) if (m.user_id) memberUserId.set(m.id, m.user_id);
  }
  const hrs = await hoursByUser(supabase, businessId, input.period_start, input.period_end);
  const periodDays = Math.max(1, Math.round((new Date(input.period_end).getTime() - new Date(input.period_start).getTime()) / 86400000) + 1);

  const lines = employees.map((e) => {
    let hours = 0, rate = 0, gross = 0;
    if (e.pay_type === "hourly") {
      const uid = e.member_profile_id ? memberUserId.get(e.member_profile_id) : undefined;
      hours = round2(uid ? (hrs.get(uid) ?? 0) : 0);
      rate = num(e.hourly_rate);
      gross = round2(hours * rate);
    } else {
      gross = round2(num(e.annual_salary) * (periodDays / 365));
    }
    const superAmount = round2(gross * num(e.super_rate) / 100);
    return {
      business_id: businessId,
      pay_run_id: (run as PayRun).id,
      employee_id: e.id,
      name: e.name,
      pay_type: e.pay_type,
      hours, rate, gross,
      super_amount: superAmount,
      tax_amount: 0,
      net: gross,
    };
  });
  if (lines.length) {
    const { error: lErr } = await tbl(supabase, "pay_run_lines").insert(lines);
    if (lErr) throw lErr;
  }
  await recomputeRunTotals((run as PayRun).id);
  revalidatePath("/payroll");
  return run as PayRun;
}

async function recomputeRunTotals(runId: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data: lines } = await tbl(supabase, "pay_run_lines").select("gross, super_amount, tax_amount, net").eq("pay_run_id", runId).eq("business_id", businessId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (lines ?? []) as any[];
  const gross_total = round2(rows.reduce((s, r) => s + num(r.gross), 0));
  const super_total = round2(rows.reduce((s, r) => s + num(r.super_amount), 0));
  const tax_total = round2(rows.reduce((s, r) => s + num(r.tax_amount), 0));
  const net_total = round2(rows.reduce((s, r) => s + num(r.net), 0));
  await tbl(supabase, "pay_runs").update({ gross_total, super_total, tax_total, net_total }).eq("id", runId).eq("business_id", businessId);
}

export async function updatePayRunLine(lineId: string, patch: { hours?: number; rate?: number; gross?: number; tax_amount?: number; super_amount?: number; note?: string | null }): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data: line } = await tbl(supabase, "pay_run_lines").select("*").eq("id", lineId).eq("business_id", businessId).single();
  if (!line) throw new Error("Line not found");
  // Block edits on a finalised run.
  const { data: run } = await tbl(supabase, "pay_runs").select("status, id").eq("id", (line as PayRunLine).pay_run_id).single();
  if ((run as PayRun)?.status === "finalised") throw new Error("This pay run is finalised");

  const hours = patch.hours ?? num(line.hours);
  const rate = patch.rate ?? num(line.rate);
  const gross = patch.gross != null ? num(patch.gross) : ((line as PayRunLine).pay_type === "hourly" ? round2(hours * rate) : num(line.gross));
  const tax_amount = patch.tax_amount != null ? num(patch.tax_amount) : num(line.tax_amount);
  const super_amount = patch.super_amount != null ? num(patch.super_amount) : num(line.super_amount);
  const net = round2(gross - tax_amount);

  const { error } = await tbl(supabase, "pay_run_lines").update({
    hours, rate, gross, tax_amount, super_amount, net,
    note: patch.note !== undefined ? patch.note : line.note,
  }).eq("id", lineId).eq("business_id", businessId);
  if (error) throw error;
  await recomputeRunTotals((line as PayRunLine).pay_run_id);
  revalidatePath(`/payroll/${(line as PayRunLine).pay_run_id}`);
}

/** Finalise a run: lock it and post wages + super to Expenses. */
export async function finalisePayRun(id: string): Promise<void> {
  const { supabase, user, businessId } = await ctx();
  await recomputeRunTotals(id);
  const { data: run } = await tbl(supabase, "pay_runs").select("*").eq("id", id).eq("business_id", businessId).single();
  if (!run) throw new Error("Pay run not found");
  if ((run as PayRun).status === "finalised") return;
  const r = run as PayRun;
  const period = `${r.period_start} → ${r.period_end}`;

  const mkExpense = async (category: string, amount: number) => {
    if (amount <= 0) return null;
    const { data } = await tbl(supabase, "expenses").insert({
      business_id: businessId, user_id: user.id, category, amount, tax_amount: 0,
      spent_on: r.pay_date, description: `Payroll ${period}`, payment_method: "bank",
    }).select("id").single();
    return (data as { id: string } | null)?.id ?? null;
  };

  const wagesId = await mkExpense("wages", r.gross_total);
  const superId = await mkExpense("superannuation", r.super_total);

  const { error } = await tbl(supabase, "pay_runs").update({
    status: "finalised", finalised_at: new Date().toISOString(),
    wages_expense_id: wagesId, super_expense_id: superId,
  }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/payroll");
  revalidatePath(`/payroll/${id}`);
  revalidatePath("/expenses");
}

export async function deletePayRun(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data: run } = await tbl(supabase, "pay_runs").select("wages_expense_id, super_expense_id").eq("id", id).eq("business_id", businessId).single();
  const expIds = [run?.wages_expense_id, run?.super_expense_id].filter(Boolean) as string[];
  if (expIds.length) {
    await tbl(supabase, "expenses").delete().in("id", expIds).eq("business_id", businessId);
  }
  const { error } = await tbl(supabase, "pay_runs").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/payroll");
  revalidatePath("/expenses");
}
