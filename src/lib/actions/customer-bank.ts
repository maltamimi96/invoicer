"use server";

/**
 * A client's bank details for direct debit.
 *
 * Stored encrypted with the same AES-256-GCM key the onboarding secure fields
 * use. Not card data — no PCI scope — but these move money out of someone's
 * account, so plaintext in a multi-tenant table isn't good enough.
 *
 * Expected failures are RETURNED, not thrown: Next masks thrown server-action
 * messages in production.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { encryptSecret, decryptSecret, secureFieldsAvailable } from "@/lib/onboarding/crypto";
import { validateBankDetails, digitsOnly, accountLast3, type BankDetailsInput } from "@/lib/customers/bank";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export type BankResult = { ok: true; last3: string | null } | { ok: false; error: string };

export async function saveCustomerBankDetails(
  customerId: string, input: BankDetailsInput,
): Promise<BankResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const problem = validateBankDetails(input);
  if (problem) return { ok: false, error: problem };

  const bsb = digitsOnly(input.bsb);
  const acct = digitsOnly(input.accountNumber);
  const name = (input.accountName ?? "").trim();

  // Clearing is a legitimate action — all three blank wipes what's stored.
  if (!bsb && !acct && !name) {
    const { error } = await tbl(supabase, "customers").update({
      bank_account_name: null, bank_bsb_enc: null, bank_account_enc: null, bank_account_last3: null,
    }).eq("id", customerId).eq("business_id", businessId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/customers/${customerId}`);
    return { ok: true, last3: null };
  }

  // No key, no storage. Refusing is the only honest option: the alternative is
  // writing an account number in the clear.
  if (!secureFieldsAvailable()) {
    return {
      ok: false,
      error: "Bank details can't be stored — the server has no encryption key (ONBOARDING_SECRET_KEY). "
        + "They'd have to be saved in plain text, so nothing was saved.",
    };
  }

  const { error } = await tbl(supabase, "customers").update({
    bank_account_name: name,
    bank_bsb_enc: encryptSecret(bsb),
    bank_account_enc: encryptSecret(acct),
    bank_account_last3: accountLast3(acct),
  }).eq("id", customerId).eq("business_id", businessId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/customers/${customerId}`);
  return { ok: true, last3: accountLast3(acct) };
}

export type RevealedBank =
  | { ok: true; accountName: string | null; bsb: string; accountNumber: string }
  | { ok: false; error: string };

/**
 * Reveal the full details. Owner/admin only — the same bar as revealing an
 * onboarding credential, and for the same reason: everyone else can see the
 * client without being able to move money from their account.
 */
export async function revealCustomerBankDetails(customerId: string): Promise<RevealedBank> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: biz } = await tbl(supabase, "businesses").select("user_id").eq("id", businessId).single();
  if (biz?.user_id !== user.id) {
    const { data: m } = await tbl(supabase, "business_members")
      .select("role").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (m?.role !== "admin") return { ok: false, error: "Only the owner or an admin can reveal bank details" };
  }

  const { data } = await tbl(supabase, "customers")
    .select("bank_account_name, bank_bsb_enc, bank_account_enc")
    .eq("id", customerId).eq("business_id", businessId).maybeSingle();
  if (!data?.bank_bsb_enc || !data?.bank_account_enc) {
    return { ok: false, error: "No bank details stored for this client" };
  }
  try {
    return {
      ok: true,
      accountName: data.bank_account_name ?? null,
      bsb: decryptSecret(data.bank_bsb_enc),
      accountNumber: decryptSecret(data.bank_account_enc),
    };
  } catch {
    // Wrong key, or the key changed since these were stored.
    return { ok: false, error: "Couldn't decrypt these details — the server's encryption key may have changed." };
  }
}
