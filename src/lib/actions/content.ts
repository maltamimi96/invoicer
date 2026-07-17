"use server";

/**
 * Content Studio — brands.
 *
 * Follows the repo's server-action conventions (CLAUDE.md): resolve the user,
 * resolve businessId server-side via getActiveBizId (never trust a client-passed
 * one), coerce empty strings to null for UUID/date columns, revalidate after
 * mutations.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import type { ContentBrand } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Postgres rejects "" for a UUID column with 22P02 — coerce, always. */
const uid = (v: unknown): string | null =>
  typeof v === "string" && UUID_RE.test(v.trim()) ? v.trim() : null;

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
};

/** Split a textarea/CSV into a clean array — no empties, no dupes. */
function toList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return [...new Set(v.map((x) => String(x).trim()).filter(Boolean))];
  }
  if (typeof v !== "string") return [];
  return [...new Set(v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
}

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function listContentBrands(): Promise<ContentBrand[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "content_brands")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentBrand[];
}

export async function getContentBrand(brandId: string): Promise<ContentBrand> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "content_brands")
    .select("*")
    .eq("id", brandId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Brand not found");
  return data as ContentBrand;
}

export interface BrandInput {
  name: string;
  customer_id?: string | null;
  industry?: string | null;
  services?: string[] | string | null;
  service_area?: string | null;
  audience?: string | null;
  voice?: string | null;
  tone?: string | null;
  proof_points?: string | null;
  banned_phrases?: string[] | string | null;
  examples?: string | null;
}

export async function createContentBrand(input: BrandInput): Promise<ContentBrand> {
  const { supabase, businessId } = await ctx();
  const name = str(input.name);
  if (!name) throw new Error("The brand needs a name.");

  const { data, error } = await tbl(supabase, "content_brands")
    .insert({
      business_id: businessId,
      customer_id: uid(input.customer_id),
      name,
      industry: str(input.industry),
      services: toList(input.services),
      service_area: str(input.service_area),
      audience: str(input.audience),
      voice: str(input.voice),
      tone: str(input.tone),
      proof_points: str(input.proof_points),
      banned_phrases: toList(input.banned_phrases),
      examples: str(input.examples),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/content");
  return data as ContentBrand;
}

export async function updateContentBrand(
  brandId: string,
  input: Partial<BrandInput>
): Promise<void> {
  const { supabase, businessId } = await ctx();

  // Only touch what was actually sent — a partial update must not blank the rest.
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = str(input.name);
    if (!name) throw new Error("The brand needs a name.");
    patch.name = name;
  }
  if (input.customer_id !== undefined) patch.customer_id = uid(input.customer_id);
  if (input.industry !== undefined) patch.industry = str(input.industry);
  if (input.services !== undefined) patch.services = toList(input.services);
  if (input.service_area !== undefined) patch.service_area = str(input.service_area);
  if (input.audience !== undefined) patch.audience = str(input.audience);
  if (input.voice !== undefined) patch.voice = str(input.voice);
  if (input.tone !== undefined) patch.tone = str(input.tone);
  if (input.proof_points !== undefined) patch.proof_points = str(input.proof_points);
  if (input.banned_phrases !== undefined) patch.banned_phrases = toList(input.banned_phrases);
  if (input.examples !== undefined) patch.examples = str(input.examples);

  if (Object.keys(patch).length === 0) return;

  const { error } = await tbl(supabase, "content_brands")
    .update(patch)
    .eq("id", brandId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);

  revalidatePath("/content");
  revalidatePath(`/content/${brandId}`);
}

export async function deleteContentBrand(brandId: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "content_brands")
    .delete()
    .eq("id", brandId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidatePath("/content");
}

// ── topics + pipeline ────────────────────────────────────────────────────────

import { spendStatus } from "@/lib/content/engine";
import { validPlatforms, type ContentKind } from "@/lib/content/pipeline";
import type { ContentTopic, ContentPiece, ContentVariation, ContentJobEvent } from "@/types/database";

export async function listContentTopics(brandId: string): Promise<ContentTopic[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "content_topics")
    .select("*")
    .eq("business_id", businessId)
    .eq("brand_id", brandId)
    .neq("status", "dismissed")
    .order("priority", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentTopic[];
}

/**
 * Queue the topic scout.
 *
 * A job, not an inline call. Measured: Opus + web search takes over four
 * minutes, which blows the serverless limit — the user would get an error while
 * the scout carried on and inserted topics anyway. Queuing means the cron runs
 * it with a lease, a retry budget, and events streaming to the terminal.
 * (The SEO plugin's scanOpportunities still runs its scout inline.)
 */
export async function scanTopics(brandId: string): Promise<{ queued: true }> {
  const { supabase, businessId } = await ctx();

  const budget = await spendStatus(supabase, businessId);
  if (!budget.ok) {
    throw new Error(
      `This month's content budget ($${(budget.budgetCents / 100).toFixed(2)}) is used up. Raise it to run the scout.`
    );
  }

  // Don't queue a second scout on top of a running one.
  const { data: existing } = await tbl(supabase, "content_jobs")
    .select("id")
    .eq("business_id", businessId)
    .eq("brand_id", brandId)
    .eq("type", "topic_scout")
    .in("status", ["queued", "running"])
    .maybeSingle();
  if (existing) throw new Error("The scout is already running for this brand.");

  const { error } = await tbl(supabase, "content_jobs").insert({
    business_id: businessId,
    brand_id: brandId,
    type: "topic_scout",
    status: "queued",
    step: 0,
    input: { brand_id: brandId },
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/content/${brandId}`);
  return { queued: true };
}

/** Is the scout working right now? Drives the button state. */
export async function scoutRunning(brandId: string): Promise<boolean> {
  const { supabase, businessId } = await ctx();
  const { data } = await tbl(supabase, "content_jobs")
    .select("id")
    .eq("business_id", businessId)
    .eq("brand_id", brandId)
    .eq("type", "topic_scout")
    .in("status", ["queued", "running"])
    .maybeSingle();
  return !!data;
}

export async function setTopicStatus(
  topicId: string,
  status: "queued" | "in_progress" | "done" | "dismissed"
): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "content_topics")
    .update({ status })
    .eq("id", topicId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
}

export async function listContentPieces(brandId: string): Promise<ContentPiece[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "content_pieces")
    .select("id, business_id, brand_id, topic_id, campaign_id, topic, kind, platforms, angle_count, current_stage, status, job_id, created_at, updated_at")
    .eq("business_id", businessId)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  // artifacts is deliberately not selected — it's large and the list doesn't
  // render it. Same reasoning as the slim list getters in CLAUDE.md.
  return (data ?? []) as ContentPiece[];
}

export async function listContentVariations(pieceId: string): Promise<ContentVariation[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "content_variations")
    .select("*")
    .eq("business_id", businessId)
    .eq("piece_id", pieceId)
    .order("angle_index")
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentVariation[];
}

export async function listContentActivity(brandId: string, limit = 80): Promise<ContentJobEvent[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "content_job_events")
    .select("*")
    .eq("business_id", businessId)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ContentJobEvent[]).reverse();
}

export interface StartPieceInput {
  brandId: string;
  topic: string;
  kind: ContentKind;
  platforms: string[];
  angleCount?: number;
  topicId?: string | null;
}

/**
 * Queue a pipeline run.
 *
 * The topic row's research is copied onto the piece as the `research` artifact.
 * That's the handoff the SEO plugin never wired: its keyword-strategist declares
 * consumes:["opportunities"] and nothing ever writes it, so the Scout's work is
 * silently discarded and only the topic string survives.
 */
export async function startContentPiece(input: StartPieceInput): Promise<{ pieceId: string }> {
  const { supabase, businessId } = await ctx();

  const topic = str(input.topic);
  if (!topic) throw new Error("Give the piece a topic.");

  const platforms = validPlatforms(input.platforms);
  if (input.kind !== "hooks" && platforms.length === 0) {
    throw new Error("Pick at least one platform.");
  }

  const budget = await spendStatus(supabase, businessId);
  if (!budget.ok) {
    throw new Error(
      `This month's content budget ($${(budget.budgetCents / 100).toFixed(2)}) is used up. Raise it in the brand's settings.`
    );
  }

  // Carry the research forward so the chain can actually read it.
  const artifacts: Record<string, { content: string; created_at: string }> = {};
  const topicId = uid(input.topicId);
  if (topicId) {
    const { data: t } = await tbl(supabase, "content_topics")
      .select("title, detail, angle_hint, season, source_urls")
      .eq("id", topicId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (t) {
      artifacts.research = {
        content: JSON.stringify(t, null, 2),
        created_at: new Date().toISOString(),
      };
    }
  }

  const { data: piece, error: pieceErr } = await tbl(supabase, "content_pieces")
    .insert({
      business_id: businessId,
      brand_id: input.brandId,
      topic_id: topicId,
      topic,
      kind: input.kind,
      platforms,
      angle_count: Math.max(1, Math.min(6, input.angleCount ?? 3)),
      artifacts,
      status: "running",
    })
    .select("id")
    .single();
  if (pieceErr) throw new Error(pieceErr.message);

  const { data: job, error: jobErr } = await tbl(supabase, "content_jobs")
    .insert({
      business_id: businessId,
      brand_id: input.brandId,
      type: "content_pipeline",
      status: "queued",
      step: 0,
      input: { content_piece_id: piece.id },
    })
    .select("id")
    .single();
  if (jobErr) throw new Error(jobErr.message);

  await tbl(supabase, "content_pieces").update({ job_id: job.id }).eq("id", piece.id);

  if (topicId) {
    await tbl(supabase, "content_topics").update({ status: "in_progress" }).eq("id", topicId);
  }

  revalidatePath(`/content/${input.brandId}`);
  return { pieceId: piece.id as string };
}

export async function setVariationStatus(
  variationId: string,
  status: "draft" | "approved" | "rejected"
): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "content_variations")
    .update({ status })
    .eq("id", variationId)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
}

export async function getContentBudget(): Promise<{ spentCents: number; budgetCents: number }> {
  const { supabase, businessId } = await ctx();
  const { spentCents, budgetCents } = await spendStatus(supabase, businessId);
  return { spentCents, budgetCents };
}
