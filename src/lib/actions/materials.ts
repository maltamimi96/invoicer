"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import type { Material } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

type NewMaterial = Omit<Material, "id" | "created_at" | "updated_at" | "user_id" | "business_id">;

export async function getMaterials(includeArchived = false): Promise<Material[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  let query = tbl(supabase, "materials").select("*").eq("business_id", businessId).order("name");
  if (!includeArchived) query = query.eq("archived", false);

  const { data, error } = await query;
  if (error) throw error;
  return data as Material[];
}

export async function createMaterial(payload: NewMaterial): Promise<Material> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "materials")
    .insert({ ...payload, user_id: user.id, business_id: businessId })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/materials");
  return data as Material;
}

export async function updateMaterial(id: string, payload: Partial<Material>): Promise<Material> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "materials")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/materials");
  return data as Material;
}

export async function deleteMaterial(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "materials")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/materials");
}

export async function bulkImportMaterials(
  rows: Array<Omit<Material, "id" | "created_at" | "updated_at" | "user_id" | "business_id" | "archived">>,
): Promise<{ imported: number; errors: string[] }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name?.trim()) { errors.push(`Row ${i + 1}: name is required`); continue; }
    const price = Number(row.cost_price);
    if (isNaN(price)) { errors.push(`Row ${i + 1} (${row.name}): cost_price must be a number`); continue; }
    const { error } = await tbl(supabase, "materials").insert({
      ...row,
      name: row.name.trim(),
      cost_price: price,
      tax_rate: Number(row.tax_rate) || 0,
      user_id: user.id,
      business_id: businessId,
      archived: false,
    });
    if (error) { errors.push(`Row ${i + 1} (${row.name}): ${error.message}`); continue; }
    imported++;
  }

  revalidatePath("/materials");
  return { imported, errors };
}
