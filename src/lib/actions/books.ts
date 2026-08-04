"use server";

/**
 * The books — money in vs money out for a period.
 *
 * CASH BASIS, deliberately. Income is what actually landed (rows in
 * `payments`), not what was invoiced. Most sole traders and small trade
 * businesses report on cash, and "profit" that counts an unpaid invoice tells
 * you that you're doing well while your bank account says otherwise. Expenses
 * likewise count on `spent_on`.
 *
 * GST is reported as collected minus paid, which is the shape of a BAS — but
 * it's a summary to hand your accountant, not a lodgement.
 */
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { buildPeriod, monthsBetween, todayStr, type PeriodKind } from "@/lib/expenses/period";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export interface BooksSummary {
  period: { kind: PeriodKind; start: string; end: string; label: string };
  income: number;
  expenses: number;
  net: number;
  gstCollected: number;
  gstPaid: number;
  gstNet: number;
  billable: number;
  expenseCount: number;
  byCategory: { category: string; total: number; count: number }[];
  byVendor: { vendor: string; total: number; count: number }[];
  byMonth: { key: string; label: string; income: number; expenses: number; net: number }[];
}

export async function getBooksSummary(
  kind: PeriodKind = "month", offset = 0, anchor?: string,
): Promise<BooksSummary> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const period = buildPeriod(kind, anchor ?? todayStr(), offset);

  const [expensesRes, paymentsRes] = await Promise.all([
    tbl(supabase, "expenses")
      .select("amount, tax_amount, category, vendor, billable, spent_on")
      .eq("business_id", businessId)
      .gte("spent_on", period.start).lte("spent_on", period.end)
      .limit(5000),
    tbl(supabase, "payments")
      .select("amount, date")
      .eq("business_id", businessId)
      .gte("date", period.start).lte("date", period.end)
      .limit(5000),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenses = (expensesRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments = (paymentsRes.data ?? []) as any[];

  const gross = (e: { amount: unknown; tax_amount: unknown }) => num(e.amount) + num(e.tax_amount);
  const expenseTotal = expenses.reduce((s, e) => s + gross(e), 0);
  const gstPaid = expenses.reduce((s, e) => s + num(e.tax_amount), 0);
  const income = payments.reduce((s, p) => s + num(p.amount), 0);

  // GST collected: payments are gross, and AU GST is 1/11th of a GST-inclusive
  // amount. Approximate — a GST-free sale would overstate it, which is exactly
  // why this is labelled an estimate in the UI.
  const gstCollected = income / 11;

  const catMap = new Map<string, { total: number; count: number }>();
  const vendorMap = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    const c = catMap.get(e.category) ?? { total: 0, count: 0 };
    catMap.set(e.category, { total: c.total + gross(e), count: c.count + 1 });
    const name = (e.vendor ?? "").trim() || "(no vendor)";
    const v = vendorMap.get(name) ?? { total: 0, count: 0 };
    vendorMap.set(name, { total: v.total + gross(e), count: v.count + 1 });
  }

  const months = monthsBetween(period.start, period.end);
  const byMonth = months.map((m) => {
    const inc = payments.filter((p) => p.date >= m.start && p.date <= m.end)
      .reduce((s, p) => s + num(p.amount), 0);
    const exp = expenses.filter((e) => e.spent_on >= m.start && e.spent_on <= m.end)
      .reduce((s, e) => s + gross(e), 0);
    return { key: m.key, label: m.label, income: inc, expenses: exp, net: inc - exp };
  });

  return {
    period,
    income,
    expenses: expenseTotal,
    net: income - expenseTotal,
    gstCollected,
    gstPaid,
    gstNet: gstCollected - gstPaid,
    billable: expenses.filter((e) => e.billable).reduce((s, e) => s + gross(e), 0),
    expenseCount: expenses.length,
    byCategory: [...catMap.entries()].map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total),
    byVendor: [...vendorMap.entries()].map(([vendor, v]) => ({ vendor, ...v }))
      .sort((a, b) => b.total - a.total).slice(0, 15),
    byMonth,
  };
}

/** Expenses for a period — what the list view shows when a period is selected. */
export async function listExpensesForPeriod(
  kind: PeriodKind = "month", offset = 0, anchor?: string,
) {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const period = buildPeriod(kind, anchor ?? todayStr(), offset);

  const { data, error } = await tbl(supabase, "expenses").select("*")
    .eq("business_id", businessId)
    .gte("spent_on", period.start).lte("spent_on", period.end)
    .order("spent_on", { ascending: false }).limit(1000);
  if (error) throw error;
  return { period, expenses: data ?? [] };
}

/** CSV for the accountant — the format every bookkeeper asks for. */
export async function exportExpensesCsv(
  kind: PeriodKind = "fy", offset = 0, anchor?: string,
): Promise<string> {
  const { period, expenses } = await listExpensesForPeriod(kind, offset, anchor);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Date", "Vendor", "Category", "Description", "Amount", "GST", "Total", "Payment method", "Billable", "Job"];
  const rows = (expenses as Record<string, unknown>[]).map((e) => [
    e.spent_on, e.vendor, e.category, e.description,
    num(e.amount).toFixed(2), num(e.tax_amount).toFixed(2),
    (num(e.amount) + num(e.tax_amount)).toFixed(2),
    e.payment_method, e.billable ? "yes" : "no", e.work_order_id ?? "",
  ].map(esc).join(","));
  return [`# Expenses ${period.label} (${period.start} to ${period.end})`, header.join(","), ...rows].join("\n");
}
