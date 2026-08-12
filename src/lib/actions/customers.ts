"use server";

import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { dispatchWebhook } from "@/lib/webhooks";
import { emitAutomationEvent } from "@/lib/automations/emit";
import type { Customer } from "@/types/database";

import { getUser } from "@/lib/auth";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

/**
 * @param includeArchived  include archived rows (the list's tabs filter them)
 * @param stage            'client' for the Clients list; omit for pickers,
 *                         which must still offer contacts created from a lead
 *                         so an existing quote can be reassigned to them.
 */
export async function getCustomers(
  includeArchived = false,
  stage?: "client" | "lead",
): Promise<Customer[]> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  return unstable_cache(
    async () => {
      // Bounded: this getter feeds list pages and pickers — an unbounded
      // select was shipping every customer row (all columns) into the RSC
      // payload on every consumer page. 1000 covers realistic tenants; a
      // paginated getter is the follow-up if someone outgrows it.
      let query = tbl(supabase, "customers").select("*").eq("business_id", businessId).order("name").limit(1000);
      // A lead you have quoted has a contact row but is not a client until
      // they pay; the Clients list would otherwise show them twice over.
      if (stage) query = query.eq("lifecycle_stage", stage);
      if (!includeArchived) query = query.eq("archived", false);
      const { data, error } = await query;
      if (error) throw error;
      return data as Customer[];
    },
    // `stage` MUST be in the key: the Clients list asks for clients only and
    // the pickers ask for everyone, so sharing one entry would let whichever
    // ran first serve the other the wrong set.
    [`customers-${businessId}-${includeArchived}-${stage ?? "all"}`],
    { tags: [`customers-${businessId}`], revalidate: 30 }
  )();
}

export async function getCustomer(id: string): Promise<Customer> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customers")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .single();
  if (error) throw error;
  return data as Customer;
}

/**
 * `lifecycle_stage` is part of the input on purpose.
 *
 * The column defaults to 'client', and the one caller that must NOT take that
 * default — quoting a lead — was silently getting it. See ensureCustomerForLead.
 */
type CreateCustomerInput =
  Omit<Customer, "lifecycle_stage" | "id" | "created_at" | "updated_at" | "user_id" | "business_id" | "account_type" | "website" | "secondary_phone" | "contact_role" | "preferred_contact" | "state" | "allowed_payment_methods" | "stripe_customer_id" | "stripe_payment_method_id" | "stripe_pm_brand" | "stripe_pm_last4" | "stripe_pm_exp" | "autopay_enabled">
  & Partial<Pick<Customer, "account_type" | "website" | "secondary_phone" | "contact_role" | "preferred_contact" | "state" | "allowed_payment_methods" | "lifecycle_stage">>;

export async function createCustomer(payload: CreateCustomerInput): Promise<Customer> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customers")
    .insert({ ...payload, user_id: user.id, business_id: businessId })
    .select()
    .single();
  if (error) throw error;
  revalidateTag(`customers-${businessId}`, {});
  revalidatePath("/customers");
  dispatchWebhook(businessId, "customer.created", data);
  // Awaited, unlike dispatchWebhook above: an automation that never queues is
  // an email the client never gets, with nothing to show it went missing.
  // emitAutomationEvent swallows its own errors, so this can't fail the create.
  await emitAutomationEvent(supabase, businessId, "customer.created", "customer", data.id);
  return data as Customer;
}

export async function updateCustomer(id: string, payload: Partial<Customer>): Promise<Customer> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customers")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  revalidateTag(`customers-${businessId}`, {});
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  dispatchWebhook(businessId, "customer.updated", data);
  return data as Customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "customers")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidateTag(`customers-${businessId}`, {});
  revalidatePath("/customers");
}

/**
 * Bulk action for the multi-select toolbar. Defaults to soft-delete
 * (archive) so historical invoice / quote / work-order links keep their
 * customer name; pass mode="hard" to actually drop the rows.
 */
export async function bulkArchiveCustomers(
  ids: string[],
  mode: "archive" | "hard" = "archive",
): Promise<{ ok: number }> {
  if (!ids.length) return { ok: 0 };
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  if (mode === "hard") {
    const { error } = await tbl(supabase, "customers")
      .delete()
      .in("id", ids)
      .eq("business_id", businessId);
    if (error) throw error;
  } else {
    const { error } = await tbl(supabase, "customers")
      .update({ archived: true })
      .in("id", ids)
      .eq("business_id", businessId);
    if (error) throw error;
  }
  revalidateTag(`customers-${businessId}`, {});
  revalidatePath("/customers");
  return { ok: ids.length };
}

/**
 * Returns aggregate stats per customer: invoice count, total billed,
 * total paid, outstanding. Cheap enough to fetch all rows for the
 * business and group client-side; we already do that elsewhere.
 */
export async function getCustomerStats(): Promise<Record<string, {
  invoice_count: number;
  total_billed: number;
  total_paid: number;
  outstanding: number;
}>> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: invoices, error } = await tbl(supabase, "invoices")
    .select("customer_id, total, amount_paid, status")
    .eq("business_id", businessId);
  if (error) throw error;

  const stats: Record<string, { invoice_count: number; total_billed: number; total_paid: number; outstanding: number }> = {};
  for (const inv of (invoices ?? []) as Array<{
    customer_id: string | null; total: number; amount_paid: number; status: string;
  }>) {
    if (!inv.customer_id) continue;
    const s = stats[inv.customer_id] ??= { invoice_count: 0, total_billed: 0, total_paid: 0, outstanding: 0 };
    s.invoice_count += 1;
    s.total_billed  += Number(inv.total ?? 0);
    s.total_paid    += Number(inv.amount_paid ?? 0);
    if (inv.status !== "cancelled" && inv.status !== "draft") {
      s.outstanding += Math.max(0, Number(inv.total ?? 0) - Number(inv.amount_paid ?? 0));
    }
  }
  return stats;
}

export async function bulkImportCustomers(
  rows: Array<Omit<Customer, "id" | "created_at" | "updated_at" | "user_id" | "business_id" | "archived" | "allowed_payment_methods" | "stripe_customer_id" | "stripe_payment_method_id" | "stripe_pm_brand" | "stripe_pm_last4" | "stripe_pm_exp" | "autopay_enabled">>
): Promise<{ imported: number; errors: string[] }> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);
  const errors: string[] = [];
  let imported = 0;

  // Validate up-front, then bulk-insert in chunks of 500. One round-trip per
  // chunk instead of one per row — 100-row CSV used to be 100 sequential
  // INSERTs, now it's 1.
  const validRows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name?.trim()) {
      errors.push(`Row ${i + 1}: name is required`);
      continue;
    }
    validRows.push({
      ...row,
      name: row.name.trim(),
      user_id: user.id,
      business_id: businessId,
      archived: false,
    });
  }

  for (let start = 0; start < validRows.length; start += 500) {
    const chunk = validRows.slice(start, start + 500);
    const { error } = await tbl(supabase, "customers").insert(chunk);
    if (error) {
      errors.push(`Rows ${start + 1}-${start + chunk.length}: ${error.message}`);
      continue;
    }
    imported += chunk.length;
  }

  revalidateTag(`customers-${businessId}`, {});
  revalidatePath("/customers");
  return { imported, errors };
}
