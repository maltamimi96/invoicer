"use server";

/**
 * Quoting and invoicing a lead.
 *
 * A lead is a person you have not been paid by yet — not a different kind of
 * record. So rather than teaching quotes, invoices, PDFs, portal links, Stripe
 * customers, deposits, autopay and dunning about a second owner type, the lead
 * gets a real contact row the first time you bill them, marked as still being
 * a lead. Every existing document path then works unchanged.
 *
 * Expected failures are RETURNED — Next masks thrown server-action messages in
 * production.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { ensureContactForLead } from "@/lib/leads/promote";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export type LeadBillingResult =
  | { ok: true; customer_id: string; created: boolean }
  | { ok: false; error: string };

/**
 * The contact row to bill this lead through, creating it on first use.
 *
 * The UI calls this and then navigates to /quotes/new?customer=<id>, so the
 * quote builder needs no notion of leads at all.
 */
export async function contactForLead(leadId: string): Promise<LeadBillingResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  try {
    const { customerId, created } = await ensureContactForLead(supabase, businessId, leadId);
    if (created) {
      revalidatePath(`/leads/${leadId}`);
      revalidatePath("/customers");
    }
    return { ok: true, customer_id: customerId, created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not prepare this lead for billing" };
  }
}

export interface LeadDocuments {
  customerId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quotes: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoices: any[];
  /** True once they have paid — they are a client, not a lead, at that point. */
  isClient: boolean;
}

/** Quotes and invoices raised against this lead, via its contact row. */
export async function getLeadDocuments(leadId: string): Promise<LeadDocuments> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: lead } = await tbl(supabase, "leads")
    .select("customer_id").eq("id", leadId).eq("business_id", businessId).maybeSingle();

  const customerId: string | null = lead?.customer_id ?? null;
  if (!customerId) return { customerId: null, quotes: [], invoices: [], isClient: false };

  const [{ data: quotes }, { data: invoices }, { data: contact }] = await Promise.all([
    tbl(supabase, "quotes")
      .select("id, number, status, total, issue_date, expiry_date")
      .eq("business_id", businessId).eq("customer_id", customerId)
      .order("created_at", { ascending: false }).limit(50),
    tbl(supabase, "invoices")
      .select("id, number, status, total, amount_paid, issue_date, due_date")
      .eq("business_id", businessId).eq("customer_id", customerId)
      .order("created_at", { ascending: false }).limit(50),
    tbl(supabase, "customers")
      .select("lifecycle_stage").eq("id", customerId).eq("business_id", businessId).maybeSingle(),
  ]);

  return {
    customerId,
    quotes: quotes ?? [],
    invoices: invoices ?? [],
    isClient: contact?.lifecycle_stage === "client",
  };
}

/**
 * A portal link for a lead — the customer end of their hub.
 *
 * The portal is keyed on a contact, so this mints the lead's contact row the
 * same way quoting them does, then reuses the existing portal token. Once they
 * have one, /portal/<token> already shows their quotes, invoices, work orders
 * and reports: none of that needed building, it needed reaching.
 *
 * **They stay a lead.** ensureContactForLead creates the contact at stage
 * 'lead'; only a payment promotes anyone.
 */
export async function getLeadPortalLink(
  leadId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  try {
    const { customerId } = await ensureContactForLead(supabase, businessId, leadId);
    const { mintPortalTokenFor } = await import("@/lib/onboarding/send");
    const token = await mintPortalTokenFor(supabase, businessId, customerId, user.id);
    const { appUrl } = await import("@/lib/app-url");
    revalidatePath(`/leads/${leadId}`);
    return { ok: true, url: `${appUrl()}/portal/${token}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create a portal link" };
  }
}

/**
 * Promote a lead to client BY HAND.
 *
 * Payment is the automatic rule and stays that way — but it can't be the only
 * one. Cash, a bank transfer settled outside Kirei, or simply deciding someone
 * is a client now: all real, none of them produce a payment row.
 *
 * Before this existed there was no path at all. Quoting a lead creates their
 * contact at stage 'lead', which set leads.customer_id, which DISABLED the
 * "To customer" button — it read "Customer linked" and did nothing. The more
 * you'd worked a lead, the more stuck it was.
 *
 * Idempotent: ensureContactForLead reuses the existing contact rather than
 * forking them, so this is safe to press twice.
 */
export async function markLeadAsClient(
  leadId: string,
): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  try {
    const { customerId } = await ensureContactForLead(supabase, businessId, leadId);
    const { markContactAsClient } = await import("@/lib/leads/promote");
    const promoted = await markContactAsClient(supabase, businessId, customerId);
    if (!promoted) {
      return { ok: false, error: "Couldn't update their record. Try again in a moment." };
    }
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);
    return { ok: true, customerId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't convert this lead" };
  }
}
