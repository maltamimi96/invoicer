/**
 * Content pipeline runner.
 *
 * Advances each claimed job by exactly ONE step per tick — the same trick the
 * SEO runner uses to stay inside the serverless timeout, and the right one.
 *
 * The difference is how work is claimed. The SEO cron plain-SELECTs
 * status='running' rows and then updates them, so two overlapping ticks pick up
 * the same job and run (and bill) the same step twice. This calls
 * claim_content_jobs(), which does the read and the claim atomically with
 * FOR UPDATE SKIP LOCKED plus a lease.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceContentJob, runTopicScout, logEvent } from "@/lib/content/engine";

export const maxDuration = 300;

/** Each job is a model round-trip; four is what fits comfortably in the tick. */
const MAX_JOBS_PER_TICK = 4;
/** Lease length. Comfortably longer than a step, shorter than a stuck run. */
const LEASE_SECS = 300;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();

  // Atomic claim. Anything another tick already holds is skipped, and a job
  // whose lease expired (function died mid-step) becomes claimable again.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs, error } = await (sb as any).rpc("claim_content_jobs", {
    max_jobs: MAX_JOBS_PER_TICK,
    lease_secs: LEASE_SECS,
  });

  if (error) {
    console.error("[content-jobs] claim failed", error.message);
    return NextResponse.json({ error: "Claim failed" }, { status: 500 });
  }

  const results: Array<{ id: string; status: string; error?: string; inserted?: number }> = [];

  for (const job of jobs ?? []) {
    try {
      if (job.type === "topic_scout") {
        // The scout is a one-shot, not a chain: Opus + web search measured at
        // over four minutes, which is why it can't run inline in an action.
        const { inserted } = await runTopicScout(sb, {
          businessId: job.business_id,
          brandId: job.brand_id,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any)
          .from("content_jobs")
          .update({ status: "done", locked_until: null, step: 1 })
          .eq("id", job.id);
        results.push({ id: job.id, status: "done", inserted });
        continue;
      }

      const out = await advanceContentJob(sb, job);
      results.push({ id: job.id, status: out.status });
    } catch (e) {
      // advanceContentJob handles its own failures; reaching here means
      // something outside a step broke. Release the lease so the job isn't
      // stranded until it expires.
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[content-jobs]", job.id, msg);
      // The scout has no inner handler of its own — without this its failures
      // would never reach the activity terminal.
      await logEvent(sb, {
        business_id: job.business_id,
        brand_id: job.brand_id,
        job_id: job.id,
        level: "error",
        message: `✕ ${job.type === "topic_scout" ? "Topic Scout" : "Pipeline"} failed: ${msg}`,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any)
        .from("content_jobs")
        .update({ status: "failed", error: msg, locked_until: null })
        .eq("id", job.id);
      results.push({ id: job.id, status: "failed", error: msg });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
