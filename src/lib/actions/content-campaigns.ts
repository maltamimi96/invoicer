"use server";

/**
 * Content Studio — campaigns, the calendar, and the schedule model.
 *
 * The schedule lands before the connectors on purpose: auto-posting waits on
 * Meta's and TikTok's review queues, which are outside our control. Everything
 * here works with "mark as posted" done by hand, and a poster added later reads
 * the same rows — approved, scheduled_at due, posted_at null — so Phase 2 is
 * purely additive rather than a rewrite.
 *
 * Kept out of content.ts because that file is already long; same ctx/uid/str
 * conventions (CLAUDE.md).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { planDates, isCadence } from "@/lib/content/schedule";
import { validPlatforms, type ContentKind } from "@/lib/content/pipeline";
import { spendStatus } from "@/lib/content/engine";
import type { ContentCampaign, ContentPiece, ContentVariation } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uid = (v: unknown): string | null =>
  typeof v === "string" && UUID_RE.test(v.trim()) ? v.trim() : null;

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
};

/** "" into a DATE column is 22P02, same as a UUID. */
const date = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

// ── campaigns ───────────────────────────────────────────────────────────────

export async function listContentCampaigns(brandId: string): Promise<ContentCampaign[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "content_campaigns")
    .select("*")
    .eq("business_id", businessId)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentCampaign[];
}

export interface CampaignInput {
  name: string;
  theme?: string | null;
  goal?: string | null;
  starts_on?: string | null;
  cadence?: string | null;
}

export async function createContentCampaign(
  brandId: string,
  input: CampaignInput
): Promise<ContentCampaign> {
  const { supabase, businessId } = await ctx();
  const name = str(input.name);
  if (!name) throw new Error("The campaign needs a name.");

  const { data, error } = await tbl(supabase, "content_campaigns")
    .insert({
      business_id: businessId,
      brand_id: brandId,
      name,
      theme: str(input.theme),
      goal: str(input.goal),
      starts_on: date(input.starts_on),
      cadence: isCadence(input.cadence) ? input.cadence : null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidatePath(`/content/${brandId}`);
  return data as ContentCampaign;
}

export async function updateContentCampaign(
  campaignId: string,
  input: Partial<CampaignInput> & { status?: ContentCampaign["status"] }
): Promise<void> {
  const { supabase, businessId } = await ctx();

  // Only touch what was sent — a partial update must not blank the rest.
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = str(input.name);
    if (!name) throw new Error("The campaign needs a name.");
    patch.name = name;
  }
  if (input.theme !== undefined) patch.theme = str(input.theme);
  if (input.goal !== undefined) patch.goal = str(input.goal);
  if (input.starts_on !== undefined) patch.starts_on = date(input.starts_on);
  if (input.cadence !== undefined) patch.cadence = isCadence(input.cadence) ? input.cadence : null;
  if (input.status !== undefined) patch.status = input.status;
  if (Object.keys(patch).length === 0) return;

  const { data, error } = await tbl(supabase, "content_campaigns")
    .update(patch)
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .select("brand_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) revalidatePath(`/content/${data.brand_id}`);
}

export async function deleteContentCampaign(campaignId: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  // The FK is ON DELETE SET NULL — pieces survive, they just lose the grouping.
  const { data, error } = await tbl(supabase, "content_campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .select("brand_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) revalidatePath(`/content/${data.brand_id}`);
}

export interface PlanCampaignInput {
  campaignId: string;
  topicIds: string[];
  kind: ContentKind;
  platforms: string[];
  angleCount?: number;
}

/**
 * Fan a campaign into one piece per topic, spread across the cadence.
 *
 * Deterministic — no agent. The creative decisions were already made by the
 * scout (which topics) and the angle strategist (what to say); spacing them on
 * a calendar is arithmetic, and paying Opus to do arithmetic would be silly.
 *
 * Each piece carries publish_on, which the platform adapter copies onto its
 * variations, so the campaign appears on the calendar as it generates.
 */
export async function planContentCampaign(
  input: PlanCampaignInput
): Promise<{ queued: number; dates: string[] }> {
  const { supabase, businessId } = await ctx();

  const { data: campaign, error: cErr } = await tbl(supabase, "content_campaigns")
    .select("*")
    .eq("id", input.campaignId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!campaign) throw new Error("Campaign not found.");
  if (!campaign.starts_on) throw new Error("Give the campaign a start date before planning it.");

  const topicIds = input.topicIds.map(uid).filter((x): x is string => !!x);
  if (topicIds.length === 0) throw new Error("Pick at least one topic to plan.");

  const platforms = validPlatforms(input.platforms);
  if (input.kind !== "hooks" && platforms.length === 0) {
    throw new Error("Pick at least one platform.");
  }

  // One budget check for the batch — each piece bills per step as it runs, and
  // the runner re-checks, so this is the early "don't queue 12 doomed jobs" gate.
  const budget = await spendStatus(supabase, businessId);
  if (!budget.ok) {
    throw new Error(
      `This month's content budget ($${(budget.budgetCents / 100).toFixed(2)}) is used up.`
    );
  }

  const { data: topics, error: tErr } = await tbl(supabase, "content_topics")
    .select("id, title, detail, angle_hint, season, source_urls, priority")
    .eq("business_id", businessId)
    .in("id", topicIds);
  if (tErr) throw new Error(tErr.message);
  if (!topics?.length) throw new Error("Those topics don't exist.");

  // Highest priority goes out first — the campaign's best material shouldn't
  // sit at the back of a six-week queue.
  const ordered = [...topics].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const dates = planDates(campaign.starts_on, campaign.cadence, ordered.length);

  const angleCount = Math.max(1, Math.min(6, input.angleCount ?? 3));
  const now = new Date().toISOString();

  let queued = 0;
  for (const [i, topic] of ordered.entries()) {
    // Carry the scout's research onto the piece — the handoff the SEO chain
    // declares and never writes.
    const artifacts = {
      research: { content: JSON.stringify(topic, null, 2), created_at: now },
    };

    const { data: piece, error: pErr } = await tbl(supabase, "content_pieces")
      .insert({
        business_id: businessId,
        brand_id: campaign.brand_id,
        campaign_id: campaign.id,
        topic_id: topic.id,
        topic: topic.title,
        kind: input.kind,
        platforms,
        angle_count: angleCount,
        publish_on: dates[i],
        artifacts,
        status: "running",
      })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);

    const { data: job, error: jErr } = await tbl(supabase, "content_jobs")
      .insert({
        business_id: businessId,
        brand_id: campaign.brand_id,
        type: "content_pipeline",
        status: "queued",
        step: 0,
        input: { content_piece_id: piece.id },
      })
      .select("id")
      .single();
    if (jErr) throw new Error(jErr.message);

    await tbl(supabase, "content_pieces").update({ job_id: job.id }).eq("id", piece.id);
    await tbl(supabase, "content_topics").update({ status: "in_progress" }).eq("id", topic.id);
    queued++;
  }

  await tbl(supabase, "content_campaigns").update({ status: "active" }).eq("id", campaign.id);

  revalidatePath(`/content/${campaign.brand_id}`);
  return { queued, dates };
}

/** A campaign's pieces, for its detail view. */
export async function listCampaignPieces(campaignId: string): Promise<ContentPiece[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "content_pieces")
    .select("id, business_id, brand_id, topic_id, campaign_id, topic, kind, platforms, angle_count, publish_on, current_stage, status, job_id, created_at, updated_at")
    .eq("business_id", businessId)
    .eq("campaign_id", campaignId)
    .order("publish_on", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentPiece[];
}

// ── the calendar + the schedule model ───────────────────────────────────────

export type CalendarEntry = ContentVariation & {
  content_pieces: { topic: string; kind: string; brand_id: string } | null;
};

/**
 * Everything scheduled in a window, for the calendar.
 *
 * Filtered by brand through the joined piece: content_variations has no
 * brand_id of its own, and inventing one would be a second source of truth for
 * something the piece already knows.
 */
export async function listContentCalendar(
  brandId: string,
  fromDate: string,
  toDate: string
): Promise<CalendarEntry[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "content_variations")
    .select("*, content_pieces!inner(topic, kind, brand_id)")
    .eq("business_id", businessId)
    .eq("content_pieces.brand_id", brandId)
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", `${fromDate}T00:00:00Z`)
    .lte("scheduled_at", `${toDate}T23:59:59Z`)
    .order("scheduled_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as CalendarEntry[];
}

/** Schedule (or, with null, unschedule) one variation. */
export async function scheduleVariation(
  variationId: string,
  scheduledAt: string | null
): Promise<void> {
  const { supabase, businessId } = await ctx();

  let when: string | null = null;
  if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (Number.isNaN(d.getTime())) throw new Error("That's not a valid date and time.");
    when = d.toISOString();
  }

  const { error } = await tbl(supabase, "content_variations")
    .update({ scheduled_at: when })
    .eq("id", variationId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
}

/**
 * The manual publish path — the one that works today, with no connector.
 *
 * Also flips status to 'posted', so the future auto-poster's due query
 * (approved AND scheduled_at <= now AND posted_at IS NULL) can never pick up
 * something a human already posted by hand.
 */
export async function markVariationPosted(
  variationId: string,
  externalUrl?: string | null
): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "content_variations")
    .update({
      status: "posted",
      posted_at: new Date().toISOString(),
      external_url: str(externalUrl),
    })
    .eq("id", variationId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
}

/** Undo a mistaken "mark as posted" — back to approved, keeping the schedule. */
export async function unmarkVariationPosted(variationId: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "content_variations")
    .update({ status: "approved", posted_at: null, external_url: null })
    .eq("id", variationId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
}
