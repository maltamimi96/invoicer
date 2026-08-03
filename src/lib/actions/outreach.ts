"use server";

/**
 * Outreach agent — settings, sequences, campaigns, enrollments, tracking.
 * The sending itself lives in src/lib/outreach/engine.ts (shared with the cron).
 * AI-tool-first: matching MCP tools use scopes outreach:read / outreach:write.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { encryptSecret, encryptionAvailable } from "@/lib/crypto";
import { autoEnroll, runOutreachForBusiness, stopEnrollments } from "@/lib/outreach/engine";
import { sourceProspects, type SourcingResult } from "@/lib/outreach/sourcing";
import { SEEDS_BY_VERTICAL } from "@/lib/outreach/seed-sequences";
import type {
  OutreachSettings, OutreachSequence, OutreachSequenceStep,
  OutreachCampaign, OutreachEnrollment, OutreachMessage,
} from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

// ── Settings ─────────────────────────────────────────────────────────────────

/** Lazily creates the settings row so the UI always has something to bind to. */
export async function getOutreachSettings(): Promise<OutreachSettings> {
  const { supabase, businessId } = await ctx();
  const { data } = await tbl(supabase, "outreach_settings").select("*").eq("business_id", businessId).maybeSingle();
  if (data) return data as OutreachSettings;
  const { data: created, error } = await tbl(supabase, "outreach_settings")
    .insert({ business_id: businessId }).select().single();
  if (error) throw error;
  return created as OutreachSettings;
}

export async function updateOutreachSettings(patch: Partial<Omit<OutreachSettings,
  "business_id" | "created_at" | "updated_at" | "places_api_key_enc">>): Promise<void> {
  const { supabase, businessId } = await ctx();
  await getOutreachSettings();
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const { error } = await tbl(supabase, "outreach_settings").update(clean).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/outreach");
}

/** Store the business's own Google Places key, encrypted at rest. */
export async function setPlacesApiKey(key: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  if (!encryptionAvailable()) throw new Error("APP_ENCRYPTION_KEY is not configured on the server");
  await getOutreachSettings();
  const { error } = await tbl(supabase, "outreach_settings")
    .update({ places_api_key_enc: key.trim() ? encryptSecret(key.trim()) : null })
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/outreach");
}

/**
 * Turning on website email-crawling records who acknowledged it and when —
 * the Spam Act prohibits sending to address-harvested lists, so this is a
 * deliberate, attributable opt-in rather than a silent toggle.
 */
export async function acknowledgeCrawlerCompliance(enable: boolean): Promise<void> {
  const { supabase, user, businessId } = await ctx();
  await getOutreachSettings();
  const { error } = await tbl(supabase, "outreach_settings").update({
    crawler_enabled: enable,
    compliance_ack_at: enable ? new Date().toISOString() : null,
    compliance_ack_by: enable ? user.id : null,
  }).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/outreach");
}

// ── Sequences + steps ────────────────────────────────────────────────────────

export async function listSequences(): Promise<(OutreachSequence & { step_count: number })[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "outreach_sequences")
    .select("*, outreach_sequence_steps(count)").eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((s) => ({
    ...s, step_count: s.outreach_sequence_steps?.[0]?.count ?? 0,
  }));
}

export async function getSequence(id: string): Promise<{ sequence: OutreachSequence; steps: OutreachSequenceStep[] }> {
  const { supabase, businessId } = await ctx();
  const [seq, steps] = await Promise.all([
    tbl(supabase, "outreach_sequences").select("*").eq("id", id).eq("business_id", businessId).single(),
    tbl(supabase, "outreach_sequence_steps").select("*").eq("sequence_id", id).order("step_order"),
  ]);
  if (seq.error) throw seq.error;
  return { sequence: seq.data as OutreachSequence, steps: (steps.data ?? []) as OutreachSequenceStep[] };
}

export async function createSequence(input: { name: string; description?: string; vertical?: string }): Promise<OutreachSequence> {
  const { supabase, businessId } = await ctx();
  if (!input.name?.trim()) throw new Error("A sequence name is required");
  const { data, error } = await tbl(supabase, "outreach_sequences").insert({
    business_id: businessId, name: input.name.trim(),
    description: input.description ?? null, vertical: input.vertical ?? null,
  }).select().single();
  if (error) throw error;
  revalidatePath("/outreach");
  return data as OutreachSequence;
}

export async function updateSequence(id: string, patch: Partial<Pick<OutreachSequence, "name" | "description" | "status" | "vertical">>): Promise<void> {
  const { supabase, businessId } = await ctx();
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const { error } = await tbl(supabase, "outreach_sequences").update(clean).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/outreach");
}

export async function deleteSequence(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "outreach_sequences").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/outreach");
}

/** Replace a sequence's steps wholesale — how the builder saves. */
export async function saveSequenceSteps(
  sequenceId: string,
  steps: { subject: string; body: string; delay_days: number }[],
): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data: owned } = await tbl(supabase, "outreach_sequences")
    .select("id").eq("id", sequenceId).eq("business_id", businessId).maybeSingle();
  if (!owned) throw new Error("Sequence not found");

  await tbl(supabase, "outreach_sequence_steps").delete().eq("sequence_id", sequenceId).eq("business_id", businessId);
  if (!steps.length) { revalidatePath("/outreach"); return; }

  const rows = steps.map((s, i) => ({
    business_id: businessId, sequence_id: sequenceId, step_order: i + 1,
    // The first step always fires immediately on enrolment.
    delay_days: i === 0 ? 0 : Math.max(0, Number(s.delay_days) || 0),
    subject: s.subject, body: s.body,
  }));
  const { error } = await tbl(supabase, "outreach_sequence_steps").insert(rows);
  if (error) throw error;
  revalidatePath("/outreach");
}

/** Create a sequence pre-filled from the seed library (editable afterwards). */
export async function seedSequence(vertical: string): Promise<OutreachSequence> {
  const { supabase, businessId } = await ctx();
  const seed = SEEDS_BY_VERTICAL[vertical];
  if (!seed) throw new Error("Unknown template");

  const { data: seq, error } = await tbl(supabase, "outreach_sequences").insert({
    business_id: businessId, name: seed.name, description: seed.description,
    vertical: seed.vertical, status: "draft",
  }).select().single();
  if (error) throw error;

  const rows = seed.steps.map((s, i) => ({
    business_id: businessId, sequence_id: seq.id, step_order: i + 1,
    delay_days: i === 0 ? 0 : s.delay_days, subject: s.subject, body: s.body,
  }));
  const { error: stepErr } = await tbl(supabase, "outreach_sequence_steps").insert(rows);
  if (stepErr) {
    await tbl(supabase, "outreach_sequences").delete().eq("id", seq.id);
    throw stepErr;
  }
  revalidatePath("/outreach");
  return seq as OutreachSequence;
}

// ── Sourcing ─────────────────────────────────────────────────────────────────

/** Run a Google Places sourcing pass now. Returns what it found/created. */
export async function runSourcingNow(limit?: number): Promise<SourcingResult> {
  const { supabase, businessId } = await ctx();
  const res = await sourceProspects(supabase, businessId, { limit });
  revalidatePath("/outreach");
  revalidatePath("/prospects");
  return res;
}

// ── Campaigns ────────────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<OutreachCampaign[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "outreach_campaigns").select("*")
    .eq("business_id", businessId).order("created_at", { ascending: false });
  if (error) throw error;
  return data as OutreachCampaign[];
}

export async function createCampaign(input: {
  name: string; sequence_id: string;
  filter?: { tags?: string[]; status?: string[]; sources?: string[] };
  auto_enroll?: boolean; daily_cap?: number | null;
}): Promise<OutreachCampaign> {
  const { supabase, businessId } = await ctx();
  if (!input.name?.trim()) throw new Error("A campaign name is required");
  const { data, error } = await tbl(supabase, "outreach_campaigns").insert({
    business_id: businessId, name: input.name.trim(), sequence_id: input.sequence_id,
    filter: input.filter ?? {}, auto_enroll: input.auto_enroll ?? true,
    daily_cap: input.daily_cap ?? null,
  }).select().single();
  if (error) throw error;
  revalidatePath("/outreach");
  return data as OutreachCampaign;
}

export async function updateCampaign(id: string, patch: Partial<Pick<OutreachCampaign,
  "name" | "sequence_id" | "status" | "filter" | "auto_enroll" | "daily_cap">>): Promise<void> {
  const { supabase, businessId } = await ctx();
  const clean: Record<string, unknown> = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (clean.status === "running") clean.started_at = new Date().toISOString();
  const { error } = await tbl(supabase, "outreach_campaigns").update(clean).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/outreach");
}

export async function deleteCampaign(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "outreach_campaigns").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/outreach");
}

/** Pull in every prospect matching the campaign's filter. Returns how many. */
export async function enrollMatchingProspects(campaignId: string): Promise<number> {
  const { supabase, businessId } = await ctx();
  const n = await autoEnroll(supabase, businessId, campaignId);
  revalidatePath("/outreach");
  return n;
}

export async function listEnrollments(campaignId: string): Promise<OutreachEnrollment[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "outreach_enrollments")
    .select("*, prospects(name,email,company)").eq("campaign_id", campaignId)
    .eq("business_id", businessId).order("enrolled_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as OutreachEnrollment[];
}

/** Mark a prospect as replied — stops every active sequence for them. */
export async function markProspectReplied(prospectId: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  await stopEnrollments(supabase, businessId, prospectId, "replied", "replied");
  await tbl(supabase, "prospects").update({ status: "responded" })
    .eq("id", prospectId).eq("business_id", businessId);
  revalidatePath("/outreach");
}

export async function stopProspectOutreach(prospectId: string, reason?: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  await stopEnrollments(supabase, businessId, prospectId, "stopped", reason);
  revalidatePath("/outreach");
}

// ── Tracking ─────────────────────────────────────────────────────────────────

export async function listOutreachMessages(filters?: { campaign_id?: string; limit?: number }): Promise<OutreachMessage[]> {
  const { supabase, businessId } = await ctx();
  let q = tbl(supabase, "outreach_messages")
    .select("*, prospects(name,company)").eq("business_id", businessId)
    .order("sent_at", { ascending: false }).limit(filters?.limit ?? 200);
  if (filters?.campaign_id) q = q.eq("campaign_id", filters.campaign_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as OutreachMessage[];
}

export interface OutreachStats {
  sent: number; delivered: number; opened: number; clicked: number;
  bounced: number; replied: number; active_enrollments: number;
}

export async function getOutreachStats(): Promise<OutreachStats> {
  const { supabase, businessId } = await ctx();
  const [msgs, enr] = await Promise.all([
    tbl(supabase, "outreach_messages").select("status, opened_at, clicked_at, replied_at, bounced_at")
      .eq("business_id", businessId).limit(10000),
    tbl(supabase, "outreach_enrollments").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("status", "active"),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (msgs.data ?? []) as any[];
  return {
    sent: rows.length,
    delivered: rows.filter((r) => r.delivered_at || ["delivered", "opened", "clicked"].includes(r.status)).length,
    opened: rows.filter((r) => r.opened_at).length,
    clicked: rows.filter((r) => r.clicked_at).length,
    bounced: rows.filter((r) => r.bounced_at || r.status === "bounced").length,
    replied: rows.filter((r) => r.replied_at).length,
    active_enrollments: enr.count ?? 0,
  };
}

/** Send whatever is due right now, ignoring the send window (manual "run now"). */
export async function runOutreachNow(limit = 25): Promise<{ sent: number; skipped: number; failed: number }> {
  const { supabase, businessId } = await ctx();
  const res = await runOutreachForBusiness(supabase, businessId, { ignoreWindow: true, limit });
  revalidatePath("/outreach");
  return { sent: res.sent, skipped: res.skipped, failed: res.failed };
}
