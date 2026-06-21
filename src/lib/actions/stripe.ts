"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { canManageSettings, type Role } from "@/lib/permissions";
import { getStripe, DEFAULT_DEPOSIT_PERCENT } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargeInvoiceToSavedCard } from "@/lib/stripe-charge";
import { randomBytes } from "crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function appBaseUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

async function resolveRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, businessId: string): Promise<Role> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any).from("businesses").select("user_id").eq("id", businessId).single();
  if (biz?.user_id === userId) return "owner";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (supabase as any)
    .from("business_members")
    .select("role").eq("business_id", businessId).eq("user_id", userId).eq("status", "active").maybeSingle();
  return (member?.role ?? "viewer") as Role;
}

export interface StripeAccountStatus {
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  country: string | null;
  platformFeePercent: number | null;
  defaultFeePercent: number;
  /** Up-front deposit % offered on quote accept. NULL = app default (50). */
  depositPercent: number | null;
  defaultDepositPercent: number;
}

/** Read the current Stripe connection state for the active business. */
export async function getStripeAccountStatus(): Promise<StripeAccountStatus> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: biz } = await tbl(supabase, "businesses")
    .select("stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_country, platform_fee_percent, deposit_percent")
    .eq("id", businessId)
    .single();

  const { defaultPlatformFeePercent } = await import("@/lib/stripe");
  return {
    connected: !!biz?.stripe_account_id,
    accountId: biz?.stripe_account_id ?? null,
    chargesEnabled: !!biz?.stripe_charges_enabled,
    payoutsEnabled: !!biz?.stripe_payouts_enabled,
    detailsSubmitted: !!biz?.stripe_details_submitted,
    country: biz?.stripe_country ?? null,
    platformFeePercent: biz?.platform_fee_percent != null ? Number(biz.platform_fee_percent) : null,
    defaultFeePercent: defaultPlatformFeePercent(),
    depositPercent: biz?.deposit_percent != null ? Number(biz.deposit_percent) : null,
    defaultDepositPercent: DEFAULT_DEPOSIT_PERCENT,
  };
}

/**
 * Create (or reuse) a Stripe Standard account for this business and return
 * a fresh onboarding URL. The caller redirects the user to it.
 */
export async function createStripeOnboardingLink(): Promise<{ url: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const role = await resolveRole(supabase, user.id, businessId);
  if (!canManageSettings(role)) throw new Error("Only owners and admins can connect Stripe");

  const { data: biz } = await tbl(supabase, "businesses")
    .select("stripe_account_id, name, email, country")
    .eq("id", businessId)
    .single();
  if (!biz) throw new Error("Business not found");

  const stripe = getStripe();
  let accountId = biz.stripe_account_id as string | null;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "standard",
      email: biz.email || user.email || undefined,
      business_profile: { name: biz.name },
      metadata: { kirei_business_id: businessId },
    });
    accountId = account.id;
    await tbl(supabase, "businesses")
      .update({ stripe_account_id: accountId, stripe_country: account.country ?? null })
      .eq("id", businessId);
  }

  const base = await appBaseUrl();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/api/stripe/connect/refresh`,
    return_url:  `${base}/api/stripe/connect/return`,
    type: "account_onboarding",
  });

  return { url: link.url };
}

/**
 * Pull the latest state from Stripe and persist the capability flags. Called
 * after the merchant returns from onboarding so the UI reflects reality
 * without waiting for the webhook.
 */
export async function syncStripeAccountStatus(): Promise<StripeAccountStatus> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: biz } = await tbl(supabase, "businesses")
    .select("stripe_account_id")
    .eq("id", businessId)
    .single();
  if (!biz?.stripe_account_id) return getStripeAccountStatus();

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(biz.stripe_account_id);

  await tbl(supabase, "businesses").update({
    stripe_charges_enabled:   !!account.charges_enabled,
    stripe_payouts_enabled:   !!account.payouts_enabled,
    stripe_details_submitted: !!account.details_submitted,
    stripe_country:           account.country ?? null,
  }).eq("id", businessId);

  revalidatePath("/settings");
  return getStripeAccountStatus();
}

/**
 * Detach this business from its Stripe account. We do NOT delete the account
 * at Stripe — the merchant keeps their dashboard, money, and history. We just
 * clear the link so charges no longer flow through Kirei.
 */
export async function disconnectStripe(): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const role = await resolveRole(supabase, user.id, businessId);
  if (!canManageSettings(role)) throw new Error("Only owners and admins can disconnect Stripe");

  await tbl(supabase, "businesses").update({
    stripe_account_id: null,
    stripe_charges_enabled: false,
    stripe_payouts_enabled: false,
    stripe_details_submitted: false,
  }).eq("id", businessId);

  revalidatePath("/settings");
}

/** Override the per-business platform fee. NULL = revert to env default. */
export async function setPlatformFeePercent(percent: number | null): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const role = await resolveRole(supabase, user.id, businessId);
  if (!canManageSettings(role)) throw new Error("Only owners and admins can change the platform fee");

  let value: number | null = null;
  if (percent != null) {
    if (!Number.isFinite(percent) || percent < 0 || percent > 30) {
      throw new Error("Fee percent must be between 0 and 30");
    }
    value = Math.round(percent * 100) / 100;
  }

  await tbl(supabase, "businesses").update({ platform_fee_percent: value }).eq("id", businessId);
  revalidatePath("/settings");
}

/** Set the up-front deposit % offered when a customer accepts a quote by card.
 *  NULL = app default (50%). 0 = no deposit option (full payment only). */
export async function setDepositPercent(percent: number | null): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const role = await resolveRole(supabase, user.id, businessId);
  if (!canManageSettings(role)) throw new Error("Only owners and admins can change the deposit");

  let value: number | null = null;
  if (percent != null) {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new Error("Deposit percent must be between 0 and 100");
    }
    value = Math.round(percent * 100) / 100;
  }

  await tbl(supabase, "businesses").update({ deposit_percent: value }).eq("id", businessId);
  revalidatePath("/settings");
}

// ===========================================================================
// Card on file / autopay
// ===========================================================================

/** Mint or reuse a 90-day portal token for a customer (admins only path). */
async function getOrMintCustomerToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  customerId: string,
  userId: string,
): Promise<string | null> {
  const { data: existing } = await tbl(supabase, "customer_portal_tokens")
    .select("token")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .is("revoked_at", null)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (existing?.token) return existing.token;
  const token = "cust_" + randomBytes(24).toString("hex");
  const { error } = await tbl(supabase, "customer_portal_tokens").insert({
    token, business_id: businessId, customer_id: customerId, created_by: userId,
    expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  });
  if (error) return null;
  return token;
}

/** A link the business can send so a customer can save a card for autopay. */
export async function getSaveCardLink(customerId: string): Promise<{ url: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const token = await getOrMintCustomerToken(supabase, businessId, customerId, user.id);
  if (!token) throw new Error("Couldn't create a secure link");
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.kireihq.com").replace(/\/$/, "");
  return { url: `${base}/api/stripe/save-card?token=${token}` };
}

/** Turn autopay on/off for a customer (off keeps the saved card, just stops auto-charging). */
export async function setCustomerAutopay(customerId: string, enabled: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "customers")
    .update({ autopay_enabled: enabled })
    .eq("id", customerId).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath(`/customers/${customerId}`);
}

/** Remove the saved card + disable autopay. Detaches the PM at Stripe too. */
export async function removeSavedCard(customerId: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: cust } = await tbl(supabase, "customers")
    .select("stripe_payment_method_id").eq("id", customerId).eq("business_id", businessId).maybeSingle();
  const { data: biz } = await tbl(supabase, "businesses")
    .select("stripe_account_id").eq("id", businessId).single();

  if (cust?.stripe_payment_method_id && biz?.stripe_account_id) {
    try {
      await getStripe().paymentMethods.detach(
        cust.stripe_payment_method_id, undefined, { stripeAccount: biz.stripe_account_id },
      );
    } catch { /* already detached / not found — fine */ }
  }

  const { error } = await tbl(supabase, "customers").update({
    stripe_payment_method_id: null, stripe_pm_brand: null, stripe_pm_last4: null,
    stripe_pm_exp: null, autopay_enabled: false,
  }).eq("id", customerId).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath(`/customers/${customerId}`);
}

/** Owner/admin: charge an invoice to the customer's saved card right now. */
export async function chargeSavedCardNow(invoiceId: string): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const role = await resolveRole(supabase, user.id, businessId);
  if (!canManageSettings(role)) throw new Error("Only owners and admins can charge a saved card");

  const res = await chargeInvoiceToSavedCard(createAdminClient(), invoiceId, businessId);
  revalidatePath(`/invoices/${invoiceId}`);
  if (res.ok) return { ok: true, message: "Card charged successfully" };
  return { ok: false, message: res.message };
}
