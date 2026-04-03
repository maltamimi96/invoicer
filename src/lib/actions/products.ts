"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { Product } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

export async function getProducts(includeArchived = false): Promise<Product[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  let query = tbl(supabase, "products").select("*").eq("business_id", businessId).order("name");
  if (!includeArchived) query = query.eq("archived", false);

  const { data, error } = await query;
  if (error) throw error;
  return data as Product[];
}

export async function createProduct(payload: Omit<Product, "id" | "created_at" | "updated_at" | "user_id">): Promise<Product> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "products")
    .insert({ ...payload, user_id: user.id, business_id: businessId })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/products");
  return data as Product;
}

export async function updateProduct(id: string, payload: Partial<Product>): Promise<Product> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "products")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/products");
  return data as Product;
}

export async function deleteProduct(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "products")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/products");
}

export async function bulkImportProducts(
  rows: Array<Omit<Product, "id" | "created_at" | "updated_at" | "user_id" | "business_id" | "archived">>
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
    const price = Number(row.unit_price);
    if (isNaN(price)) { errors.push(`Row ${i + 1} (${row.name}): unit_price must be a number`); continue; }
    const { error } = await tbl(supabase, "products").insert({
      ...row,
      name: row.name.trim(),
      unit_price: price,
      tax_rate: Number(row.tax_rate) || 0,
      user_id: user.id,
      business_id: businessId,
      archived: false,
    });
    if (error) { errors.push(`Row ${i + 1} (${row.name}): ${error.message}`); continue; }
    imported++;
  }

  revalidatePath("/products");
  return { imported, errors };
}
