"use server";

/**
 * Expenses & job costing (field-services plugin). Track business/job costs with
 * a receipt, optionally linked to a work order. AI-tool-first: every action has
 * a matching MCP tool (scopes expenses:read / expenses:write).
 */
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import type { Expense, ExpenseStatus } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uid = (v: string | null | undefined) => (v && UUID_RE.test(v.trim()) ? v.trim() : null);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function biz(): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  return getActiveBizId(supabase, user.id);
}

export async function listExpenses(filters?: { work_order_id?: string; limit?: number }): Promise<Expense[]> {
  const businessId = await biz();
  const supabase = await createClient();
  let q = tbl(supabase, "expenses").select("*").eq("business_id", businessId)
    .order("spent_on", { ascending: false }).limit(filters?.limit ?? 300);
  if (filters?.work_order_id) q = q.eq("work_order_id", filters.work_order_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Expense[];
}

export async function createExpense(input: {
  amount: number | string;
  category?: string;
  vendor?: string | null;
  description?: string | null;
  tax_amount?: number | string;
  spent_on?: string | null;
  payment_method?: string | null;
  work_order_id?: string | null;
  billable?: boolean;
  reimbursable?: boolean;
  receipt_path?: string | null;
}): Promise<Expense> {
  const businessId = await biz();
  const user = await getUser();
  const supabase = await createClient();
  const { data, error } = await tbl(supabase, "expenses").insert({
    business_id: businessId,
    user_id: user.id,
    amount: num(input.amount),
    tax_amount: num(input.tax_amount),
    category: input.category?.trim() || "other",
    vendor: input.vendor?.trim() || null,
    description: input.description?.trim() || null,
    spent_on: input.spent_on?.trim() || new Date().toISOString().split("T")[0],
    payment_method: input.payment_method?.trim() || null,
    work_order_id: uid(input.work_order_id),
    billable: !!input.billable,
    reimbursable: !!input.reimbursable,
    receipt_path: input.receipt_path?.trim() || null,
  }).select().single();
  if (error) throw error;
  revalidatePath("/expenses");
  return data as Expense;
}

export async function updateExpense(id: string, patch: Partial<{
  amount: number | string; tax_amount: number | string; category: string; vendor: string | null;
  description: string | null; spent_on: string; payment_method: string | null; work_order_id: string | null;
  billable: boolean; reimbursable: boolean; status: ExpenseStatus; receipt_path: string | null;
}>): Promise<void> {
  const businessId = await biz();
  const supabase = await createClient();
  const clean: Record<string, unknown> = {};
  if (patch.amount !== undefined) clean.amount = num(patch.amount);
  if (patch.tax_amount !== undefined) clean.tax_amount = num(patch.tax_amount);
  if (patch.category !== undefined) clean.category = patch.category?.trim() || "other";
  if (patch.vendor !== undefined) clean.vendor = patch.vendor?.trim() || null;
  if (patch.description !== undefined) clean.description = patch.description?.trim() || null;
  if (patch.spent_on !== undefined) clean.spent_on = patch.spent_on;
  if (patch.payment_method !== undefined) clean.payment_method = patch.payment_method?.trim() || null;
  if (patch.work_order_id !== undefined) clean.work_order_id = uid(patch.work_order_id);
  if (patch.billable !== undefined) clean.billable = !!patch.billable;
  if (patch.reimbursable !== undefined) clean.reimbursable = !!patch.reimbursable;
  if (patch.status !== undefined) clean.status = patch.status;
  if (patch.receipt_path !== undefined) clean.receipt_path = patch.receipt_path?.trim() || null;
  if (Object.keys(clean).length === 0) return;
  const { error } = await tbl(supabase, "expenses").update(clean).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/expenses");
}

export async function deleteExpense(id: string): Promise<void> {
  const businessId = await biz();
  const supabase = await createClient();
  const { error } = await tbl(supabase, "expenses").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/expenses");
}

/** Upload a receipt image; returns the storage path (private bucket). */
export async function uploadReceipt(formData: FormData): Promise<string> {
  const businessId = await biz();
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file");
  if (file.size > 10 * 1024 * 1024) throw new Error("Receipt must be under 10MB");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${businessId}/${randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from("expense-receipts").upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return path;
}

/** Signed URL for a stored receipt. */
export async function getReceiptUrl(path: string): Promise<string | null> {
  await biz();
  const admin = createAdminClient();
  const { data } = await admin.storage.from("expense-receipts").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
