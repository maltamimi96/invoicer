/**
 * GET /api/cron/seo-jobs
 *
 * The SEO job engine's runner. Each tick claims a few runnable content-pipeline
 * jobs and advances each by ONE agent step (one Claude call), so no single
 * invocation runs long. Jobs pause themselves at the edit gate
 * (awaiting_approval); the rest re-queue as 'running' and progress next tick.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceContentJob } from "@/lib/seo/engine";
import { requireCron } from "@/lib/cron-auth";

// Give each tick room for a few sequential Claude calls.
export const maxDuration = 300;

const MAX_JOBS_PER_TICK = 4;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs } = await (sb as any)
    .from("seo_jobs")
    .select("*")
    .eq("type", "content_pipeline")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_TICK);

  const runnable = (jobs ?? []) as Array<{ id: string; business_id: string; step: number; input: { content_piece_id?: string }; cost_cents: number }>;
  const results: Array<{ job: string; status: string; stage?: string }> = [];

  for (const job of runnable) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from("seo_jobs").update({ status: "running" }).eq("id", job.id);
      const r = await advanceContentJob(sb, job);
      results.push({ job: job.id, status: r.status, stage: r.stage });
    } catch (e) {
      results.push({ job: job.id, status: "error: " + (e instanceof Error ? e.message : String(e)) });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
