"use server";

import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { Customer } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

export async function getCustomers(includeArchived = false): Promise<Customer[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  return unstable_cache(
    async () => {
      let query = tbl(supabase, "customers").select("*").eq("business_id", businessId).order("name");
      if (!includeArchived) query = query.eq("archived", false);
      const { data, error } = await query;
      if (error) throw error;
      return data as Customer[];
    },
    [`customers-${businessId}-${includeArchived}`],
    { tags: [`customers-${businessId}`], revalidate: 30 }
  )();
}

export async function getCustomer(id: string): Promise<Customer> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customers")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .single();
  if (error) throw error;
  return data as Customer;
}

export async function createCustomer(payload: Omit<Customer, "id" | "created_at" | "updated_at" | "user_id">): Promise<Customer> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "customers")
    .insert({ ...payload, user_id: user.id, business_id: businessId })
    .select()
    .single();
  if (error) throw error;
  revalidateTag(`customers-${businessId}`, {});
  revalidatePath("/customers");
  return data as Customer;
}

export async function updateCustomer(id: string, payload: Partial<Customer>): Promise<Customer> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

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
  return data as Customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "customers")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidateTag(`customers-${businessId}`, {});
  revalidatePath("/customers");
}

export async function bulkImportCustomers(
  rows: Array<Omit<Customer, "id" | "created_at" | "updated_at" | "user_id" | "business_id" | "archived">>
): Promise<{ imported: number; errors: string[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name?.trim()) { errors.push(`Row ${i + 1}: name is required`); continue; }
    const { error } = await tbl(supabase, "customers").insert({
      ...row,
      name: row.name.trim(),
      user_id: user.id,
      business_id: businessId,
      archived: false,
    });
    if (error) { errors.push(`Row ${i + 1} (${row.name}): ${error.message}`); continue; }
    imported++;
  }

  revalidateTag(`customers-${businessId}`, {});
  revalidatePath("/customers");
  return { imported, errors };
}
