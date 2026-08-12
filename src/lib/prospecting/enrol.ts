/**
 * Approving a candidate, and everything that follows from it.
 *
 * The whole point of joining the two plugins: one action turns a business the
 * agent found into a prospect with a contact address, enrolled in the pitch
 * written for that kind of business. Before this, approving created a prospect
 * with no email — which `autoEnroll` filters out — so the sequence could never
 * reach it and the operator had to find an address by hand.
 *
 * The order matters and is deliberate:
 *   1. Create the prospect. If everything after fails, you still have the lead.
 *   2. Look for an email. Optional, opt-in, and allowed to find nothing.
 *   3. Enrol. Only if there's an address and the hunt names a sequence.
 *
 * Nothing here sends anything. Enrolling puts a prospect in a sequence; the
 * outreach engine decides when to send, inside the send window and under the
 * daily cap it already enforces.
 */

import { findEmail } from "./email-finder";
import type { ProspectCandidate } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export interface EnrolOutcome {
  added: number;
  /** How many we found a contact address for. */
  enriched: number;
  /** How many actually entered a sequence. */
  enrolled: number;
  /** Why the rest didn't — shown to the operator rather than swallowed. */
  notes: string[];
}

/** Is the crawler switched on for this business? Opt-in, per the Spam Act note. */
async function crawlerEnabled(sb: SB, businessId: string): Promise<boolean> {
  const { data } = await sb.from("outreach_settings")
    .select("crawler_enabled").eq("business_id", businessId).maybeSingle();
  return Boolean(data?.crawler_enabled);
}

/**
 * Turn approved candidates into prospects, optionally enriched and enrolled.
 *
 * `candidates` must already be scoped to the business by the caller.
 */
export async function approveCandidates(
  sb: SB,
  businessId: string,
  userId: string | null,
  candidates: ProspectCandidate[],
  hunt: { id: string; campaign_id: string | null; auto_enrol: boolean } | null,
): Promise<EnrolOutcome> {
  const out: EnrolOutcome = { added: 0, enriched: 0, enrolled: 0, notes: [] };

  const fresh = candidates.filter((c) => !c.prospect_id);
  if (!fresh.length) return out;

  // ── 1. Create the prospects ─────────────────────────────────────────────
  const { data: created, error } = await sb.from("prospects").insert(
    fresh.map((c) => ({
      business_id: businessId,
      user_id: userId,
      hunt_id: hunt?.id ?? null,
      company: c.name,
      name: null,
      email: null,
      phone: c.phone,
      website: c.website,
      source: "hunt",
      status: "new",
      tags: c.category ? [c.category] : [],
      notes: [c.address, c.reasoning ? `Why it matched: ${c.reasoning}` : null]
        .filter(Boolean).join(" · ") || null,
      custom_fields: {
        place_id: c.place_id, hunt_id: c.hunt_id, fit_score: c.score,
        rating: c.rating, review_count: c.review_count,
      },
    })),
  ).select("id, website");
  if (error) throw error;

  const rows = (created ?? []) as { id: string; website: string | null }[];
  out.added = rows.length;

  // Pair candidate → prospect by website, falling back to position. The
  // original code paired by array index alone off a multi-row insert, whose
  // return order PostgREST does not guarantee — a silent mis-link between the
  // queue and the prospect list.
  await Promise.all(fresh.map((c, i) => {
    const match = rows.find((r) => r.website && r.website === c.website) ?? rows[i];
    return sb.from("prospect_candidates").update({
      status: "added", prospect_id: match?.id ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", c.id).eq("business_id", businessId);
  }));

  // ── 2. Look for contact addresses ───────────────────────────────────────
  if (!(await crawlerEnabled(sb, businessId))) {
    out.notes.push(
      "Email lookup is off, so these have no address yet. Turn it on in Outreach settings to have Kirei read the contact page of each business's own website.",
    );
    return out;
  }

  const withSite = rows.filter((r) => r.website);
  for (const row of withSite) {
    const found = await findEmail(row.website);
    await sb.from("prospects").update({
      email: found?.email ?? null,
      email_source: found ? "crawl" : null,
      enriched_at: new Date().toISOString(),
    }).eq("id", row.id).eq("business_id", businessId);
    if (found) out.enriched++;
  }

  const noSite = rows.length - withSite.length;
  if (noSite > 0) {
    out.notes.push(`${noSite} had no website to check — a phone call is the way in for those.`);
  }
  if (out.enriched < withSite.length) {
    out.notes.push(`${withSite.length - out.enriched} published no address on their site.`);
  }

  // ── 3. Enrol ────────────────────────────────────────────────────────────
  if (!hunt?.auto_enrol) return out;
  if (!hunt.campaign_id) {
    out.notes.push("This hunt has no outreach campaign set, so nothing was enrolled.");
    return out;
  }
  if (!out.enriched) return out;

  // The campaign owns the sequence; read it rather than storing a second copy
  // on the hunt that could drift out of step with it.
  const { data: campaign } = await sb.from("outreach_campaigns")
    .select("id, sequence_id, status")
    .eq("id", hunt.campaign_id).eq("business_id", businessId).maybeSingle();
  if (!campaign?.sequence_id) {
    out.notes.push("That campaign has no sequence, so nothing was enrolled.");
    return out;
  }

  const { data: enriched } = await sb.from("prospects")
    .select("id").eq("business_id", businessId)
    .in("id", rows.map((r) => r.id)).not("email", "is", null);

  const ids = ((enriched ?? []) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return out;

  // `campaign_id` is NOT NULL on enrollments, and (campaign_id, prospect_id)
  // is unique — so re-approving something already in the campaign is a no-op
  // rather than a second sequence running at the same person.
  const { error: enrolError } = await sb.from("outreach_enrollments").upsert(
    ids.map((prospectId) => ({
      business_id: businessId,
      campaign_id: campaign.id,
      prospect_id: prospectId,
      sequence_id: campaign.sequence_id,
      status: "active",
      current_step: 0,
      next_send_at: new Date().toISOString(),
    })),
    { onConflict: "campaign_id,prospect_id", ignoreDuplicates: true },
  );
  if (enrolError) {
    out.notes.push(`Couldn't enrol into the sequence: ${enrolError.message}`);
    return out;
  }
  out.enrolled = ids.length;
  return out;
}
