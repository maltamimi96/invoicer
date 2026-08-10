/**
 * Turning a lead into someone you can bill, without turning them into a client.
 *
 * Session-free so a cron, a webhook or a server action can all call it — the
 * same shape as lib/sms.ts and lib/onboarding/send.ts. Takes a Supabase client
 * rather than making one.
 *
 * Two moments, and they are deliberately different:
 *
 *   ensureContactForLead  — you quoted them. They get a contact row so the
 *                           quote, its PDF, its portal link and its deposit
 *                           all work exactly as they do for a client. They
 *                           stay a lead: stage 'lead', absent from Clients.
 *
 *   markContactAsClient   — they paid. Stage flips to 'client' and they appear
 *                           in Clients. This is the only automatic promotion,
 *                           because paying is what the user defines a client as.
 */

import type { Lead } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

const tbl = (sb: Sb, name: string) => sb.from(name);

/**
 * Exactly the lead columns this module reads.
 *
 * Typed as a Pick of the real Lead so a name that isn't a column cannot be
 * written here without TypeScript objecting. `tbl()` returns `any`, which is
 * how `city`, `postcode` and `company` — none of which exist on leads — got
 * selected and shipped. The type in database.ts was right the whole time;
 * nothing was reading it.
 */
type LeadForContact = Pick<
  Lead, "id" | "user_id" | "name" | "email" | "phone" | "address" | "suburb" | "customer_id" | "source"
>;
const LEAD_CONTACT_COLUMNS: ReadonlyArray<keyof LeadForContact> = [
  "id", "user_id", "name", "email", "phone", "address", "suburb", "customer_id", "source",
];

export interface LeadContactResult {
  customerId: string;
  /** True when this call created the row, false when the lead already had one. */
  created: boolean;
}

/**
 * The contact row for a lead, creating it if this is the first document.
 *
 * Idempotent: a lead that already has customer_id gets that row back, so
 * quoting the same lead twice never produces two contacts. That link is the
 * whole point — `leads.customer_id` existed before but was only written on an
 * explicit convert, which is how one person could end up as both a lead and a
 * separate client.
 */
export async function ensureContactForLead(
  sb: Sb, businessId: string, leadId: string,
): Promise<LeadContactResult> {
  const { data, error } = await tbl(sb, "leads")
    .select(LEAD_CONTACT_COLUMNS.join(", "))
    .eq("id", leadId).eq("business_id", businessId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lead not found");
  const lead = data as LeadForContact;

  if (lead.customer_id) return { customerId: lead.customer_id, created: false };

  // Reuse an existing contact with the same email before creating one. A lead
  // captured from a form and a client typed in by hand are regularly the same
  // person, and quoting the lead should not fork them.
  const email = (lead.email ?? "").trim().toLowerCase();
  if (email) {
    const { data: match } = await tbl(sb, "customers")
      .select("id").eq("business_id", businessId).ilike("email", email).limit(1).maybeSingle();
    if (match?.id) {
      await tbl(sb, "leads").update({ customer_id: match.id }).eq("id", leadId);
      return { customerId: match.id, created: false };
    }
  }

  const { data: created, error: insErr } = await tbl(sb, "customers").insert({
    business_id: businessId,
    // NOT NULL with no default. Carry the lead's owner across — omitting it
    // failed every insert with a null-violation, behind the column error.
    user_id: lead.user_id,
    name: lead.name?.trim() || "Unnamed lead",
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    address: lead.address ?? null,
    // leads.suburb is the city-level field; customers calls it `city`. There
    // is no postcode or company on a lead to carry.
    city: lead.suburb ?? null,
    // The point of the whole exercise: billable, but not yet a client.
    lifecycle_stage: "lead",
  }).select("id").single();
  if (insErr) throw new Error(insErr.message);

  // Billing them is a pipeline event: a lead you have just quoted is not still
  // "new". Only nudged forward from the earliest states, so a manual "lost"
  // or "won" is never overwritten by the act of raising a document.
  await tbl(sb, "leads")
    .update({ customer_id: created.id, status: "quoted" })
    .eq("id", leadId).in("status", ["new", "contacted"]);
  // The link itself must be written even when the status guard above matched
  // nothing, or a lead already marked won/lost would never get its contact.
  await tbl(sb, "leads").update({ customer_id: created.id }).eq("id", leadId);
  return { customerId: created.id, created: true };
}

/**
 * They paid — they are a client now.
 *
 * Best-effort by design: this runs from payment paths, and a failure here must
 * never fail the payment. A contact who paid but is still labelled a lead is a
 * tidy-up problem; a payment that errored because of a label is a real one.
 *
 * Returns true when it actually promoted someone, so callers can log it.
 */
export async function markContactAsClient(
  sb: Sb, businessId: string, customerId: string | null | undefined,
): Promise<boolean> {
  if (!customerId) return false;
  try {
    const { data } = await tbl(sb, "customers")
      .update({ lifecycle_stage: "client" })
      .eq("id", customerId).eq("business_id", businessId)
      .eq("lifecycle_stage", "lead")   // only ever lead → client, never back
      .select("id");

    // The pipeline follows the money too. Two fields already meant "became a
    // customer" — leads.status='won' and the contact's stage — and nothing kept
    // them together: of 11 leads marked won, 10 had no contact at all. Payment
    // is now the single authority and the board is derived from it, rather
    // than being a third independent opinion.
    await tbl(sb, "leads")
      .update({ status: "won" })
      .eq("business_id", businessId).eq("customer_id", customerId)
      .in("status", ["new", "contacted", "quoted"]);   // never reopen a lost lead

    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    console.error("[leads] promote to client failed", e instanceof Error ? e.message : e);
    return false;
  }
}

/** The lead this contact came from, if any — for showing provenance. */
export async function leadForContact(
  sb: Sb, businessId: string, customerId: string,
): Promise<{ id: string; status: string } | null> {
  const { data } = await tbl(sb, "leads")
    .select("id, status").eq("business_id", businessId).eq("customer_id", customerId)
    .limit(1).maybeSingle();
  return data ?? null;
}
