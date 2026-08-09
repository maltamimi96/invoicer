"use server";

/**
 * Recurring costs: rent, insurance, subscriptions, finance.
 *
 * Expected failures are RETURNED — Next masks thrown server-action messages
 * in production, and "the end date is before the first charge" is a message
 * someone needs to read.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import {
  validateSchedule, nextDueDate, type ExpenseCadence,
} from "@/lib/recurring/expense-schedule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export interface RecurringExpense {
  id: string;
  name: string;
  vendor: string | null;
  category: string;
  description: string | null;
  amount: number;
  tax_amount: number;
  payment_method: string | null;
  billable: boolean;
  cadence: ExpenseCadence;
  preferred_day_of_month: number | null;
  next_run_on: string;
  ends_on: string | null;
  active: boolean;
  last_run_at: string | null;
}

export type RecurringExpenseResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function getRecurringExpenses(): Promise<RecurringExpense[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "recurring_expenses")
    .select("*").eq("business_id", businessId)
    .order("active", { ascending: false })
    .order("next_run_on", { ascending: true })
    .limit(500);
  if (error) { console.error("[recurring-expenses] list", error.message); return []; }

  // PostgREST returns numerics as strings; plain arithmetic downstream gives
  // NaN, which has bitten this codebase before.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    ...r, amount: Number(r.amount ?? 0), tax_amount: Number(r.tax_amount ?? 0),
  })) as RecurringExpense[];
}

export async function saveRecurringExpense(
  id: string | null,
  input: Partial<RecurringExpense>,
): Promise<RecurringExpenseResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const problem = validateSchedule(input);
  if (problem) return { ok: false, error: problem };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = {
    business_id: businessId,
    name: String(input.name).trim(),
    vendor: input.vendor?.trim() || null,
    category: input.category?.trim() || "other",
    description: input.description?.trim() || null,
    amount: Number(input.amount),
    tax_amount: Number(input.tax_amount ?? 0) || 0,
    payment_method: input.payment_method?.trim() || null,
    billable: Boolean(input.billable),
    cadence: input.cadence ?? "monthly",
    preferred_day_of_month: input.preferred_day_of_month ?? null,
    next_run_on: input.next_run_on,
    ends_on: input.ends_on || null,
    active: input.active ?? true,
  };

  if (id) {
    const { error } = await tbl(supabase, "recurring_expenses")
      .update(row).eq("id", id).eq("business_id", businessId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/expenses/recurring");
    return { ok: true, id };
  }

  row.user_id = user.id;
  const { data, error } = await tbl(supabase, "recurring_expenses")
    .insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expenses/recurring");
  return { ok: true, id: data.id };
}

export async function setRecurringExpenseActive(
  id: string, active: boolean,
): Promise<RecurringExpenseResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "recurring_expenses")
    .update({ active }).eq("id", id).eq("business_id", businessId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expenses/recurring");
  return { ok: true, id };
}

export async function deleteRecurringExpense(id: string): Promise<RecurringExpenseResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "recurring_expenses")
    .delete().eq("id", id).eq("business_id", businessId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expenses/recurring");
  // Expenses already posted are left alone: they are real costs that were
  // really incurred, and deleting the schedule is not a claim they weren't.
  return { ok: true, id };
}

/** Post this schedule's next occurrence now, without waiting for the cron. */
export async function runRecurringExpenseNow(id: string): Promise<RecurringExpenseResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: sch } = await tbl(supabase, "recurring_expenses")
    .select("*").eq("id", id).eq("business_id", businessId).maybeSingle();
  if (!sch) return { ok: false, error: "Not found" };

  const spentOn = String(sch.next_run_on);
  const { error: insErr } = await tbl(supabase, "expenses").insert({
    business_id: businessId, user_id: user.id, recurring_expense_id: sch.id,
    vendor: sch.vendor, category: sch.category,
    description: sch.description ?? sch.name,
    amount: sch.amount, tax_amount: sch.tax_amount, spent_on: spentOn,
    payment_method: sch.payment_method, billable: sch.billable, status: "recorded",
  });
  if (insErr) {
    if (insErr.code === "23505") return { ok: false, error: "That one's already been posted." };
    return { ok: false, error: insErr.message };
  }

  const next = nextDueDate(spentOn, sch.cadence as ExpenseCadence, sch.preferred_day_of_month);
  await tbl(supabase, "recurring_expenses")
    .update({ next_run_on: next, last_run_at: new Date().toISOString() })
    .eq("id", id).eq("business_id", businessId);

  revalidatePath("/expenses/recurring");
  revalidatePath("/expenses");
  return { ok: true, id };
}
