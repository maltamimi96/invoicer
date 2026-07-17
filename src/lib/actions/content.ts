"use server";

/**
 * Content Studio — brands.
 *
 * Follows the repo's server-action conventions (CLAUDE.md): resolve the user,
 * resolve businessId server-side via getActiveBizId (never trust a client-passed
 * one), coerce empty strings to null for UUID/date columns, revalidate after
 * mutations.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import type { ContentBrand } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Postgres rejects "" for a UUID column with 22P02 — coerce, always. */
const uid = (v: unknown): string | null =>
  typeof v === "string" && UUID_RE.test(v.trim()) ? v.trim() : null;

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
};

/** Split a textarea/CSV into a clean array — no empties, no dupes. */
function toList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return [...new Set(v.map((x) => String(x).trim()).filter(Boolean))];
  }
  if (typeof v !== "string") return [];
  return [...new Set(v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
}

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function listContentBrands(): Promise<ContentBrand[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "content_brands")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentBrand[];
}

export async function getContentBrand(brandId: string): Promise<ContentBrand> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "content_brands")
    .select("*")
    .eq("id", brandId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Brand not found");
  return data as ContentBrand;
}

export interface BrandInput {
  name: string;
  customer_id?: string | null;
  industry?: string | null;
  services?: string[] | string | null;
  service_area?: string | null;
  audience?: string | null;
  voice?: string | null;
  tone?: string | null;
  proof_points?: string | null;
  banned_phrases?: string[] | string | null;
  examples?: string | null;
}

export async function createContentBrand(input: BrandInput): Promise<ContentBrand> {
  const { supabase, businessId } = await ctx();
  const name = str(input.name);
  if (!name) throw new Error("The brand needs a name.");

  const { data, error } = await tbl(supabase, "content_brands")
    .insert({
      business_id: businessId,
      customer_id: uid(input.customer_id),
      name,
      industry: str(input.industry),
      services: toList(input.services),
      service_area: str(input.service_area),
      audience: str(input.audience),
      voice: str(input.voice),
      tone: str(input.tone),
      proof_points: str(input.proof_points),
      banned_phrases: toList(input.banned_phrases),
      examples: str(input.examples),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/content");
  return data as ContentBrand;
}

export async function updateContentBrand(
  brandId: string,
  input: Partial<BrandInput>
): Promise<void> {
  const { supabase, businessId } = await ctx();

  // Only touch what was actually sent — a partial update must not blank the rest.
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = str(input.name);
    if (!name) throw new Error("The brand needs a name.");
    patch.name = name;
  }
  if (input.customer_id !== undefined) patch.customer_id = uid(input.customer_id);
  if (input.industry !== undefined) patch.industry = str(input.industry);
  if (input.services !== undefined) patch.services = toList(input.services);
  if (input.service_area !== undefined) patch.service_area = str(input.service_area);
  if (input.audience !== undefined) patch.audience = str(input.audience);
  if (input.voice !== undefined) patch.voice = str(input.voice);
  if (input.tone !== undefined) patch.tone = str(input.tone);
  if (input.proof_points !== undefined) patch.proof_points = str(input.proof_points);
  if (input.banned_phrases !== undefined) patch.banned_phrases = toList(input.banned_phrases);
  if (input.examples !== undefined) patch.examples = str(input.examples);

  if (Object.keys(patch).length === 0) return;

  const { error } = await tbl(supabase, "content_brands")
    .update(patch)
    .eq("id", brandId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);

  revalidatePath("/content");
  revalidatePath(`/content/${brandId}`);
}

export async function deleteContentBrand(brandId: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "content_brands")
    .delete()
    .eq("id", brandId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidatePath("/content");
}
