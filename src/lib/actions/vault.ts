"use server";

/**
 * Password vault — the only path in or out of vault_items.
 *
 * Three rules hold everywhere in this file:
 *
 *  1. **Ciphertext never leaves the server.** The list returns
 *     `has_password: boolean`, not the encrypted blob. There is no reason for
 *     a browser to hold ciphertext, and holding it means a cached RSC payload
 *     or a devtools inspection carries a secret it didn't need to.
 *  2. **Plaintext only on an explicit reveal**, by an owner or admin, and the
 *     reveal is logged. RLS already restricts these tables to owner/admin, but
 *     reveal re-checks in application code — this is the one place worth
 *     paying for defence in depth.
 *  3. **No key, no save.** If APP_ENCRYPTION_KEY is missing the feature
 *     refuses rather than falling back to plaintext. A vault that silently
 *     stores passwords in the clear is worse than no vault.
 *
 * Expected failures are RETURNED, not thrown — Next masks thrown server-action
 * messages in production.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { encryptSecret, decryptSecret, encryptionAvailable } from "@/lib/crypto";
import {
  validateVaultItem, normaliseUrl,
  type VaultItemInput, type VaultItemView,
} from "@/lib/vault/items";
import type { Role } from "@/lib/permissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uid = (v: string | null | undefined) => (v && UUID_RE.test(v.trim()) ? v.trim() : null);
const str = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};

export type VaultResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

async function callerRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, userId: string, businessId: string,
): Promise<Role> {
  const { data: biz } = await tbl(supabase, "businesses").select("user_id").eq("id", businessId).single();
  if (biz?.user_id === userId) return "owner";
  const { data: member } = await tbl(supabase, "business_members")
    .select("role").eq("business_id", businessId).eq("user_id", userId)
    .eq("status", "active").maybeSingle();
  return (member?.role ?? "viewer") as Role;
}

const canUseVault = (role: Role) => role === "owner" || role === "admin";

/** Record who did what. Never records the secret itself. */
async function log(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, businessId: string,
  entry: { item_id: string | null; item_title: string | null; user_id: string; user_email: string | null; action: string },
) {
  // Best-effort: a failed audit write must not block the user's action, but it
  // must be awaited — a floating promise in a serverless function is a log
  // entry that may simply never be written.
  const { error } = await tbl(supabase, "vault_access_log").insert({ business_id: businessId, ...entry });
  if (error) console.error("[vault] audit write failed", error.message);
}

/** Entries, newest first. Never includes ciphertext or plaintext. */
export async function listVaultItems(customerId?: string): Promise<VaultItemView[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  if (!canUseVault(await callerRole(supabase, user.id, businessId))) return [];

  let q = tbl(supabase, "vault_items")
    .select("id, title, category, username, url, customer_id, password_enc, notes_enc, created_at, updated_at, customers(name)")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(500);
  const cid = uid(customerId);
  if (cid) q = q.eq("customer_id", cid);

  const { data, error } = await q;
  if (error) { console.error("[vault] list failed", error.message); return []; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    username: r.username,
    url: r.url,
    customer_id: r.customer_id,
    customer_name: r.customers?.name ?? null,
    // Booleans, not the blobs. This mapping is the rule — don't spread `r`.
    has_password: Boolean(r.password_enc),
    has_notes: Boolean(r.notes_enc),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function saveVaultItem(
  itemId: string | null,
  input: VaultItemInput,
): Promise<VaultResult<{ id: string }>> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  if (!canUseVault(await callerRole(supabase, user.id, businessId))) {
    return { ok: false, error: "Only the owner or an admin can use the vault" };
  }
  if (!encryptionAvailable()) {
    return {
      ok: false,
      error: "The vault needs APP_ENCRYPTION_KEY (64 hex characters) set on the server before it can store anything.",
    };
  }

  const id = uid(itemId);
  const problem = validateVaultItem(input, { isNew: !id });
  if (problem) return { ok: false, error: problem };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = {
    business_id: businessId,
    title: (input.title ?? "").trim(),
    category: str(input.category) ?? "other",
    username: str(input.username),
    url: normaliseUrl(input.url),
    customer_id: uid(input.customerId),
  };

  // A blank secret field on an EDIT means "leave it alone", not "erase it" —
  // the form can't prefill a password it was never given. Clearing is done by
  // deleting the entry.
  const password = input.password ?? "";
  const notes = input.notes ?? "";
  if (password.trim() || !id) row.password_enc = password.trim() ? encryptSecret(password) : null;
  if (notes.trim() || !id) row.notes_enc = notes.trim() ? encryptSecret(notes) : null;

  if (id) {
    const { error } = await tbl(supabase, "vault_items")
      .update(row).eq("id", id).eq("business_id", businessId);
    if (error) return { ok: false, error: error.message };
    await log(supabase, businessId, {
      item_id: id, item_title: row.title, user_id: user.id, user_email: user.email ?? null, action: "update",
    });
    revalidatePath("/vault");
    if (row.customer_id) revalidatePath(`/customers/${row.customer_id}`);
    return { ok: true, data: { id } };
  }

  row.created_by = user.id;
  const { data, error } = await tbl(supabase, "vault_items").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await log(supabase, businessId, {
    item_id: data.id, item_title: row.title, user_id: user.id, user_email: user.email ?? null, action: "create",
  });
  revalidatePath("/vault");
  if (row.customer_id) revalidatePath(`/customers/${row.customer_id}`);
  return { ok: true, data: { id: data.id } };
}

/**
 * Decrypt one entry, for one look.
 *
 * The role check here is redundant with RLS by design. RLS is the gate that
 * matters, but this is the single function in the app that turns stored
 * ciphertext into a password, and a future refactor that moved it onto the
 * admin client would silently lose the gate. Cheap insurance.
 */
export async function revealVaultSecret(
  itemId: string,
): Promise<VaultResult<{ password: string | null; notes: string | null }>> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  if (!canUseVault(await callerRole(supabase, user.id, businessId))) {
    return { ok: false, error: "Only the owner or an admin can reveal a password" };
  }
  const id = uid(itemId);
  if (!id) return { ok: false, error: "Not found" };

  const { data, error } = await tbl(supabase, "vault_items")
    .select("id, title, password_enc, notes_enc")
    .eq("id", id).eq("business_id", businessId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Not found" };

  let password: string | null = null;
  let notes: string | null = null;
  try {
    if (data.password_enc) password = decryptSecret(data.password_enc);
    if (data.notes_enc) notes = decryptSecret(data.notes_enc);
  } catch {
    // Almost always a changed/rotated key. Say that, rather than "malformed
    // payload" — the person reading it needs to know the data isn't corrupt.
    return {
      ok: false,
      error: "This couldn't be decrypted. It was saved with a different APP_ENCRYPTION_KEY than the server is using now.",
    };
  }

  await log(supabase, businessId, {
    item_id: id, item_title: data.title, user_id: user.id, user_email: user.email ?? null, action: "reveal",
  });
  return { ok: true, data: { password, notes } };
}

export async function deleteVaultItem(itemId: string): Promise<VaultResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  if (!canUseVault(await callerRole(supabase, user.id, businessId))) {
    return { ok: false, error: "Only the owner or an admin can use the vault" };
  }
  const id = uid(itemId);
  if (!id) return { ok: false, error: "Not found" };

  // Read the title first: once the row is gone the audit entry can't name it.
  const { data: existing } = await tbl(supabase, "vault_items")
    .select("title, customer_id").eq("id", id).eq("business_id", businessId).maybeSingle();

  const { error } = await tbl(supabase, "vault_items")
    .delete().eq("id", id).eq("business_id", businessId);
  if (error) return { ok: false, error: error.message };

  await log(supabase, businessId, {
    item_id: null, item_title: existing?.title ?? null,
    user_id: user.id, user_email: user.email ?? null, action: "delete",
  });
  revalidatePath("/vault");
  if (existing?.customer_id) revalidatePath(`/customers/${existing.customer_id}`);
  return { ok: true };
}

export interface VaultLogEntry {
  id: string;
  item_title: string | null;
  user_email: string | null;
  action: string;
  created_at: string;
}

/** Who opened what, newest first. */
export async function getVaultLog(limit = 100): Promise<VaultLogEntry[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  if (!canUseVault(await callerRole(supabase, user.id, businessId))) return [];

  const { data } = await tbl(supabase, "vault_access_log")
    .select("id, item_title, user_email, action, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 500));
  return (data ?? []) as VaultLogEntry[];
}

/** Whether the server can actually encrypt — the UI says so up front. */
export async function vaultReady(): Promise<boolean> {
  return encryptionAvailable();
}

export async function setVaultEnabled(enabled: boolean): Promise<VaultResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  if (!canUseVault(await callerRole(supabase, user.id, businessId))) {
    return { ok: false, error: "Only the owner or an admin can turn the vault on" };
  }
  const { error } = await tbl(supabase, "vault_settings")
    .upsert({ business_id: businessId, enabled }, { onConflict: "business_id" });
  if (error) return { ok: false, error: error.message };

  // Mirror into the plugin install row so the Plugins store and the sidebar
  // agree — the same two-way sync every other flagged plugin does.
  await tbl(supabase, "business_agent_installs")
    .upsert({ business_id: businessId, agent_id: "vault", enabled }, { onConflict: "business_id,agent_id" });

  revalidatePath("/", "layout");
  return { ok: true };
}
