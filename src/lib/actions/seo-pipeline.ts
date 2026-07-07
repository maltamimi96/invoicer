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
import { advanceContentJob, type ContentType } from "@/lib/seo/engine";

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
  revalidatePath("/seo");
  return { piece_id: piece.id };
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
