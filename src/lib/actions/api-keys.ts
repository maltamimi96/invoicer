"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { canManageSettings, type Role } from "@/lib/permissions";
import { generateApiKey } from "@/lib/api-auth";
import type { ApiScope, BusinessApiKey, ALL_API_SCOPES } from "@/types/database";
import { ALL_API_SCOPES as VALID_SCOPES } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function getCallerContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  // Check role
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any).from("businesses").select("user_id").eq("id", businessId).single();
  let role: Role = "owner";
  if (biz?.user_id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (supabase as any)
      .from("business_members")
      .select("role")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    role = (member?.role ?? "viewer") as Role;
  }

  if (!canManageSettings(role)) throw new Error("Forbidden");

  return { user, businessId };
}

/**
 * Create a new API key. Returns the plaintext key — shown once, never stored.
 */
export async function createApiKey(
  label: string,
  scopes: ApiScope[]
): Promise<{ key: string; apiKey: Omit<BusinessApiKey, "key_hash"> }> {
  const { user, businessId } = await getCallerContext();

  if (!label || label.trim().length === 0) throw new Error("Label is required");
  if (label.length > 100) throw new Error("Label must be 100 characters or less");
  if (!scopes.length) throw new Error("At least one scope is required");

  // Validate scopes
  const validValues = VALID_SCOPES.map((s) => s.value);
  for (const scope of scopes) {
    if (!validValues.includes(scope)) throw new Error(`Invalid scope: ${scope}`);
  }

  const { key, prefix, hashPromise } = generateApiKey();
  const keyHash = await hashPromise;

  const sb = createAdminClient();
  const { data, error } = await tbl(sb, "business_api_keys")
    .insert({
      business_id: businessId,
      user_id: user.id,
      label: label.trim(),
      key_prefix: prefix,
      key_hash: keyHash,
      scopes,
    })
    .select("id, business_id, user_id, label, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at")
    .single();

  if (error) throw new Error("Failed to create API key");

  revalidatePath("/settings");

  return { key, apiKey: data };
}

/**
 * List all active (non-revoked) API keys for the current business.
 */
export async function listApiKeys(): Promise<Omit<BusinessApiKey, "key_hash">[]> {
  const { businessId } = await getCallerContext();

  const sb = createAdminClient();
  const { data, error } = await tbl(sb, "business_api_keys")
    .select("id, business_id, user_id, label, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at")
    .eq("business_id", businessId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Failed to list API keys");
  return data ?? [];
}

/**
 * Revoke an API key (soft-delete by setting revoked_at).
 */
export async function revokeApiKey(id: string): Promise<void> {
  const { businessId } = await getCallerContext();

  const sb = createAdminClient();
  const { error } = await tbl(sb, "business_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) throw new Error("Failed to revoke API key");
  revalidatePath("/settings");
}
