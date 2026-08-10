"use server";

/**
 * Payment details on file — the only path in or out of
 * customer_payment_details.
 *
 * Same three rules as the password vault, for the same reasons:
 *
 *  1. **Ciphertext never leaves the server.** The list returns a masked hint
 *     and `has_account: boolean`, never the encrypted blob. A browser holding
 *     ciphertext means a cached RSC payload carries a secret it didn't need.
 *  2. **Plaintext only on an explicit reveal**, by an owner or admin, and the
 *     reveal is logged. RLS already limits these tables to owner/admin; reveal
 *     re-checks in application code, which is the one place worth paying for
 *     defence in depth.
 *  3. **No key, no save.** Without APP_ENCRYPTION_KEY this refuses rather than
 *     writing bank details in the clear.
 *
 * 🔴 And one of its own: no card numbers. `validatePaymentDetail` runs a Luhn
 * check on what's typed and rejects a PAN, the DB CHECK allows no card kind,
 * and there is no CVV field anywhere in the shape.
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
  validatePaymentDetail, maskAccount, kindDef,
  type PaymentDetailInput, type PaymentDetailKind,
} from "@/lib/payments/details";
import type { Role } from "@/lib/permissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uid = (v: string | null | undefined) => (v && UUID_RE.test(v.trim()) ? v.trim() : null);
const str = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};

export type PaymentResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/** Safe to send to a browser: no ciphertext, no plaintext. */
export interface PaymentDetailView {
  id: string;
  customer_id: string;
  kind: PaymentDetailKind;
  label: string | null;
  holder_name: string | null;
  bank_name: string | null;
  hint: string | null;
  notes: string | null;
  is_default: boolean;
  has_account: boolean;
  created_at: string;
}

export interface PaymentLogEntry {
  id: string;
  detail_label: string | null;
  user_email: string | null;
  action: string;
  created_at: string;
}

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

const canUse = (role: Role) => role === "owner" || role === "admin";

/** Record who did what. Never records the number itself. */
async function log(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, businessId: string,
  entry: {
    detail_id: string | null; detail_label: string | null; customer_id: string | null;
    user_id: string; user_email: string | null; action: string;
  },
) {
  // Awaited, not floating: a promise left dangling in a serverless function is
  // an audit entry that may simply never be written.
  const { error } = await tbl(supabase, "payment_detail_access_log")
    .insert({ business_id: businessId, ...entry });
  if (error) console.error("[payment-details] audit write failed", error.message);
}

/** Details for one customer (or all). Masked only — never ciphertext. */
export async function listPaymentDetails(customerId?: string): Promise<PaymentDetailView[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  if (!canUse(await callerRole(supabase, user.id, businessId))) return [];

  let q = tbl(supabase, "customer_payment_details")
    .select("id, customer_id, kind, label, holder_name, bank_name, hint, notes, is_default, account_enc, created_at")
    .eq("business_id", businessId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  const cid = uid(customerId);
  if (cid) q = q.eq("customer_id", cid);

  const { data, error } = await q;
  if (error) { console.error("[payment-details] list", error.message); return []; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id, customer_id: r.customer_id, kind: r.kind,
    label: r.label, holder_name: r.holder_name, bank_name: r.bank_name,
    hint: r.hint, notes: r.notes, is_default: r.is_default,
    has_account: Boolean(r.account_enc),   // the blob itself stays here
    created_at: r.created_at,
  }));
}

export async function savePaymentDetail(
  detailId: string | null,
  customerId: string,
  input: PaymentDetailInput,
): Promise<PaymentResult<{ id: string }>> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  if (!canUse(await callerRole(supabase, user.id, businessId))) {
    return { ok: false, error: "Only the owner or an admin can store payment details" };
  }
  if (!encryptionAvailable()) {
    return {
      ok: false,
      error: "APP_ENCRYPTION_KEY isn't set on the server, so these can't be stored safely. "
        + "Set it before saving bank details.",
    };
  }
  const cid = uid(customerId);
  if (!cid) return { ok: false, error: "Pick a client first" };

  const problem = validatePaymentDetail(input);
  if (problem) return { ok: false, error: problem };

  const kind = (input.kind ?? "bank_au") as PaymentDetailKind;
  const account = (input.account ?? "").trim();
  const routing = (input.routing ?? "").trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = {
    business_id: businessId,
    customer_id: cid,
    kind,
    label: str(input.label) ?? kindDef(kind).label,
    holder_name: str(input.holder_name),
    bank_name: str(input.bank_name),
    notes: str(input.notes),
    is_default: Boolean(input.is_default),
    account_enc: encryptSecret(account),
    routing_enc: routing ? encryptSecret(routing) : null,
    hint: maskAccount(account),
    updated_at: new Date().toISOString(),
  };

  const existing = uid(detailId);
  let id: string;
  if (existing) {
    const { error } = await tbl(supabase, "customer_payment_details")
      .update(row).eq("id", existing).eq("business_id", businessId);
    if (error) return { ok: false, error: error.message };
    id = existing;
  } else {
    row.created_by = user.id;
    const { data, error } = await tbl(supabase, "customer_payment_details")
      .insert(row).select("id").single();
    if (error) return { ok: false, error: error.message };
    id = data.id;
  }

  // One default per customer, enforced here rather than by a partial unique
  // index: flipping a new row to default should demote the old one, not fail.
  if (row.is_default) {
    await tbl(supabase, "customer_payment_details")
      .update({ is_default: false })
      .eq("business_id", businessId).eq("customer_id", cid).neq("id", id);
  }

  await log(supabase, businessId, {
    detail_id: id, detail_label: row.label, customer_id: cid,
    user_id: user.id, user_email: user.email ?? null,
    action: existing ? "update" : "create",
  });

  revalidatePath(`/customers/${cid}`);
  return { ok: true, data: { id } };
}

/**
 * The plaintext, for keying into a bank portal. Owner/admin only, logged.
 *
 * This is the one call that returns a real account number, which is why it is
 * separate from the list rather than a flag on it.
 */
export async function revealPaymentDetail(
  detailId: string,
): Promise<PaymentResult<{ account: string | null; routing: string | null }>> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  if (!canUse(await callerRole(supabase, user.id, businessId))) {
    return { ok: false, error: "Only the owner or an admin can reveal payment details" };
  }
  const id = uid(detailId);
  if (!id) return { ok: false, error: "Not found" };

  const { data, error } = await tbl(supabase, "customer_payment_details")
    .select("id, label, customer_id, account_enc, routing_enc")
    .eq("id", id).eq("business_id", businessId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Not found" };

  let account: string | null = null;
  let routing: string | null = null;
  try {
    if (data.account_enc) account = decryptSecret(data.account_enc);
    if (data.routing_enc) routing = decryptSecret(data.routing_enc);
  } catch {
    return {
      ok: false,
      error: "This couldn't be decrypted. It was saved with a different APP_ENCRYPTION_KEY than the server is using now.",
    };
  }

  await log(supabase, businessId, {
    detail_id: id, detail_label: data.label, customer_id: data.customer_id,
    user_id: user.id, user_email: user.email ?? null, action: "reveal",
  });
  return { ok: true, data: { account, routing } };
}

export async function deletePaymentDetail(detailId: string): Promise<PaymentResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  if (!canUse(await callerRole(supabase, user.id, businessId))) {
    return { ok: false, error: "Only the owner or an admin can delete payment details" };
  }
  const id = uid(detailId);
  if (!id) return { ok: false, error: "Not found" };

  const { data: row } = await tbl(supabase, "customer_payment_details")
    .select("label, customer_id").eq("id", id).eq("business_id", businessId).maybeSingle();

  const { error } = await tbl(supabase, "customer_payment_details")
    .delete().eq("id", id).eq("business_id", businessId);
  if (error) return { ok: false, error: error.message };

  await log(supabase, businessId, {
    detail_id: null, detail_label: row?.label ?? null, customer_id: row?.customer_id ?? null,
    user_id: user.id, user_email: user.email ?? null, action: "delete",
  });
  if (row?.customer_id) revalidatePath(`/customers/${row.customer_id}`);
  return { ok: true };
}

/** Who looked at what. Owner/admin only, like everything else here. */
export async function getPaymentDetailLog(limit = 100): Promise<PaymentLogEntry[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  if (!canUse(await callerRole(supabase, user.id, businessId))) return [];

  const { data } = await tbl(supabase, "payment_detail_access_log")
    .select("id, detail_label, user_email, action, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as PaymentLogEntry[];
}

/** Whether the server can encrypt — the UI disables saving without it. */
export async function paymentDetailsReady(): Promise<boolean> {
  return encryptionAvailable();
}
