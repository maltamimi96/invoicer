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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

const tbl = (sb: Sb, name: string) => sb.from(name);

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
  const { data: lead, error } = await tbl(sb, "leads")
    .select("id, name, email, phone, address, city, postcode, company, customer_id, source")
    .eq("id", leadId).eq("business_id", businessId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) throw new Error("Lead not found");

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
    name: lead.name?.trim() || lead.company?.trim() || "Unnamed lead",
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    address: lead.address ?? null,
    city: lead.city ?? null,
    postcode: lead.postcode ?? null,
    company: lead.company ?? null,
    // The point of the whole exercise: billable, but not yet a client.
    lifecycle_stage: "lead",
  }).select("id").single();
  if (insErr) throw new Error(insErr.message);

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
