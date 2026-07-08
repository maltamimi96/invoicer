"use server";

/**
 * SEO content pipeline — start / advance / approve (docs/SEO_AGENCY_PLAN.md 2.3).
 *
 * The heavy work (Claude calls) runs through the admin client after a cookie
 * auth + business-ownership check. A pipeline advances one agent step per call;
 * the cron (/api/cron/seo-jobs) advances queued pieces in the background, and
 * this action lets the UI push a piece forward on demand.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { advanceContentJob, seoSpendStatus, runOpportunityScout, type ContentType } from "@/lib/seo/engine";
import { publishContent } from "@/lib/seo/publish";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function biz(): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  return getActiveBizId(supabase, user.id);
}

export async function startContentPipeline(input: {
  site_id: string;
  topic: string;
  content_type?: ContentType;
  title?: string;
}): Promise<{ piece_id: string }> {
  const businessId = await biz();
  const user = await getUser();
  const admin = createAdminClient();

  const contentType = input.content_type ?? "blog";
  const { data: piece, error } = await tbl(admin, "seo_content_pieces").insert({
    business_id: businessId,
    site_id: input.site_id,
    title: input.title?.trim() || input.topic.trim(),
    topic: input.topic.trim(),
    content_type: contentType,
    status: "brief",
    pipeline_status: "running",
    artifacts: {},
  }).select("id").single();
  if (error) throw error;

  const { data: job, error: jobErr } = await tbl(admin, "seo_jobs").insert({
    business_id: businessId,
    site_id: input.site_id,
    type: "content_pipeline",
    status: "queued",
    step: 0,
    input: { content_piece_id: piece.id, created_by: user.id },
  }).select("id").single();
  if (jobErr) throw jobErr;

  await tbl(admin, "seo_content_pieces").update({ job_id: job.id }).eq("id", piece.id);
  await tbl(admin, "seo_job_events").insert({
    business_id: businessId, site_id: input.site_id, job_id: job.id, level: "info",
    message: `Queued "${input.topic.trim()}" (${contentType})`,
  });
  revalidatePath("/seo");
  return { piece_id: piece.id };
}

/** Run the Opportunity Scout on a site — populates the queue. */
export async function scanOpportunities(siteId: string): Promise<{ inserted: number }> {
  const businessId = await biz();
  const admin = createAdminClient();
  const { data: site } = await tbl(admin, "seo_sites").select("id").eq("id", siteId).eq("business_id", businessId).maybeSingle();
  if (!site) throw new Error("Site not found");
  const res = await runOpportunityScout(admin, { businessId, siteId });
  revalidatePath(`/seo/${siteId}`);
  return res;
}

export async function listOpportunities(siteId: string) {
  const businessId = await biz();
  const supabase = await createClient();
  const { data } = await tbl(supabase, "seo_opportunities")
    .select("id, type, title, detail, priority, status, created_at")
    .eq("business_id", businessId).eq("site_id", siteId)
    .order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as Array<{ id: string; type: string; title: string; detail: string | null; priority: number; status: string; created_at: string }>;
}

export async function setOpportunityStatus(id: string, status: string, siteId: string): Promise<void> {
  const businessId = await biz();
  const admin = createAdminClient();
  await tbl(admin, "seo_opportunities").update({ status }).eq("id", id).eq("business_id", businessId);
  revalidatePath(`/seo/${siteId}`);
}

/** Start a content pipeline from an opportunity and mark it in-progress. */
export async function writeOpportunity(opportunityId: string, siteId: string, contentType?: ContentType): Promise<{ piece_id: string }> {
  const businessId = await biz();
  const supabase = await createClient();
  const { data: opp } = await tbl(supabase, "seo_opportunities").select("title").eq("id", opportunityId).eq("business_id", businessId).maybeSingle();
  if (!opp) throw new Error("Opportunity not found");
  const started = await startContentPipeline({ site_id: siteId, topic: opp.title, content_type: contentType });
  await setOpportunityStatus(opportunityId, "in_progress", siteId);
  return started;
}

/** Publish an approved piece through a connected gateway. */
export async function publishContentPiece(pieceId: string, connectionId: string): Promise<{ url: string | null; ref?: string }> {
  const businessId = await biz();
  const admin = createAdminClient();
  const { data: piece } = await tbl(admin, "seo_content_pieces").select("id").eq("id", pieceId).eq("business_id", businessId).maybeSingle();
  if (!piece) throw new Error("Piece not found");
  const res = await publishContent(admin, { businessId, pieceId, connectionId });
  revalidatePath(`/seo/content/${pieceId}`);
  return res;
}

/** Agent activity events for a site (chronological) — powers the terminal. */
export async function listSeoActivity(siteId: string, limit = 80) {
  const businessId = await biz();
  const supabase = await createClient();
  const { data } = await tbl(supabase, "seo_job_events")
    .select("id, agent_id, level, message, cost_cents, created_at")
    .eq("business_id", businessId).eq("site_id", siteId)
    .order("created_at", { ascending: false }).limit(limit);
  return ((data ?? []) as Array<{ id: string; agent_id: string | null; level: string; message: string; cost_cents: number; created_at: string }>).reverse();
}

/** Advance a piece's pipeline by one agent step (returns the new status). */
export async function advanceContentPipeline(pieceId: string): Promise<{ status: string }> {
  const businessId = await biz();
  const admin = createAdminClient();

  const { data: piece } = await tbl(admin, "seo_content_pieces")
    .select("id, job_id, business_id").eq("id", pieceId).eq("business_id", businessId).maybeSingle();
  if (!piece?.job_id) throw new Error("No pipeline job for this piece");

  const { data: job } = await tbl(admin, "seo_jobs").select("*").eq("id", piece.job_id).maybeSingle();
  if (!job) throw new Error("Job not found");
  if (job.status === "awaiting_approval" || job.status === "done") return { status: job.status };

  await tbl(admin, "seo_jobs").update({ status: "running" }).eq("id", job.id);
  const result = await advanceContentJob(admin, job);
  revalidatePath("/seo");
  revalidatePath(`/seo/content/${pieceId}`);
  return result;
}

export async function approveContentPiece(pieceId: string): Promise<void> {
  const businessId = await biz();
  const admin = createAdminClient();
  const { data: piece } = await tbl(admin, "seo_content_pieces")
    .select("id, job_id").eq("id", pieceId).eq("business_id", businessId).maybeSingle();
  if (!piece) throw new Error("Piece not found");
  await tbl(admin, "seo_content_pieces").update({ pipeline_status: "done", status: "approved" }).eq("id", pieceId);
  if (piece.job_id) await tbl(admin, "seo_jobs").update({ status: "done" }).eq("id", piece.job_id);
  revalidatePath("/seo");
  revalidatePath(`/seo/content/${pieceId}`);
}

export async function listContentPieces(siteId?: string) {
  const businessId = await biz();
  const supabase = await createClient();
  let q = tbl(supabase, "seo_content_pieces")
    .select("id, site_id, title, topic, content_type, status, pipeline_status, current_stage, created_at, seo_sites(domain)")
    .eq("business_id", businessId).order("created_at", { ascending: false }).limit(200);
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getContentPiece(pieceId: string) {
  const businessId = await biz();
  const supabase = await createClient();
  const { data } = await tbl(supabase, "seo_content_pieces")
    .select("*, seo_sites(domain)").eq("id", pieceId).eq("business_id", businessId).maybeSingle();
  return data ?? null;
}

/** Month-to-date SEO spend vs. the monthly budget cap (cents). */
export async function getSeoBudget(): Promise<{ spentCents: number; budgetCents: number; ok: boolean }> {
  const businessId = await biz();
  const supabase = await createClient();
  return seoSpendStatus(supabase, businessId);
}

/** Set the monthly SEO budget (cents; 0 = unlimited). RLS gates this to owners. */
export async function setSeoBudget(cents: number): Promise<void> {
  const businessId = await biz();
  const supabase = await createClient();
  const v = Math.max(0, Math.round(cents));
  const { error } = await tbl(supabase, "businesses").update({ seo_monthly_budget_cents: v }).eq("id", businessId);
  if (error) throw error;
  revalidatePath("/seo");
  revalidatePath("/seo/content");
}
