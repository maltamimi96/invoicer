"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import type { LineItem, RecurringInvoice, RecurringJobCadence } from "@/types/database";
import { totalsFromLineItems } from "@/lib/recurring/totals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

export interface RecurringInvoiceInput {
  name: string;
  customer_id: string;
  line_items: LineItem[];
  notes?: string | null;
  terms?: string | null;
  cadence: RecurringJobCadence;
  preferred_day_of_month?: number | null;
  due_days?: number;
  next_run_on: string;          // ISO date
  ends_on?: string | null;
  auto_charge?: boolean;
  send_email?: boolean;
  active?: boolean;
}

export async function getRecurringInvoices(): Promise<RecurringInvoice[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "recurring_invoices")
    .select("*").eq("business_id", businessId).order("next_run_on");
  if (error) throw error;
  return (data ?? []) as RecurringInvoice[];
}

export async function createRecurringInvoice(input: RecurringInvoiceInput): Promise<RecurringInvoice> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  if (!input.name?.trim()) throw new Error("A schedule name is required");
  if (!input.customer_id) throw new Error("A customer is required");
  if (!input.line_items?.length) throw new Error("Add at least one line item");

  const totals = totalsFromLineItems(input.line_items);
  const { data, error } = await tbl(supabase, "recurring_invoices").insert({
    business_id: businessId,
    user_id: user.id,
    name: input.name.trim(),
    customer_id: input.customer_id,
    line_items: input.line_items,
    subtotal: totals.subtotal,
    tax_total: totals.tax_total,
    total: totals.total,
    notes: input.notes ?? null,
    terms: input.terms ?? null,
    cadence: input.cadence,
    preferred_day_of_month: input.preferred_day_of_month ?? null,
    due_days: input.due_days ?? 14,
    next_run_on: input.next_run_on,
    ends_on: input.ends_on ?? null,
    auto_charge: input.auto_charge ?? true,
    send_email: input.send_email ?? true,
    active: input.active ?? true,
  }).select().single();
  if (error) throw error;
  revalidatePath("/recurring-invoices");
  return data as RecurringInvoice;
}

export async function updateRecurringInvoice(id: string, updates: Partial<RecurringInvoiceInput>): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = { ...updates };
  if (updates.line_items) {
    const t = totalsFromLineItems(updates.line_items);
    patch.subtotal = t.subtotal; patch.tax_total = t.tax_total; patch.total = t.total;
  }
  const { error } = await tbl(supabase, "recurring_invoices")
    .update(patch).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/recurring-invoices");
}

export async function setRecurringInvoiceActive(id: string, active: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "recurring_invoices")
    .update({ active }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/recurring-invoices");
}

export async function deleteRecurringInvoice(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "recurring_invoices")
    .delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/recurring-invoices");
}

/**
 * Generate this schedule's invoice immediately (and auto-charge / email per its
 * settings) without waiting for the daily cron. Does NOT advance next_run_on —
 * it's a manual "bill now". Returns what happened.
 */
export async function runRecurringInvoiceNow(id: string): Promise<{ number: string; charged: boolean; emailed: boolean }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: r } = await tbl(supabase, "recurring_invoices")
    .select("*").eq("id", id).eq("business_id", businessId).maybeSingle();
  if (!r) throw new Error("Recurring invoice not found");

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { generateRecurringInvoice } = await import("@/lib/recurring/generate-invoice");
  const out = await generateRecurringInvoice(createAdminClient(), {
    businessId,
    userId: r.user_id,
    customerId: r.customer_id,
    lineItems: r.line_items ?? [],
    subtotal: Number(r.subtotal), taxTotal: Number(r.tax_total), total: Number(r.total),
    dueDays: r.due_days ?? 14,
    notes: r.notes, terms: r.terms,
    autoCharge: r.auto_charge, sendEmail: r.send_email,
  });
  await tbl(supabase, "recurring_invoices").update({ last_invoice_id: out.invoiceId, last_run_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/recurring-invoices");
  revalidatePath("/invoices");
  return { number: out.number, charged: out.charged, emailed: out.emailed };
}
