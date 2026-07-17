-- ============================================================================
-- claim_content_jobs — atomic job claiming for the content runner.
--
-- This function is the whole reason it exists. The SEO cron does:
--
--     select * from seo_jobs where status in ('queued','running') limit 4   -- (1)
--     update seo_jobs set status='running' where id = ...                   -- (2)
--     advanceContentJob(job)                                                -- (3)
--
-- with nothing between (1) and (2). Two overlapping ticks both read the same
-- row and both run step N: two Claude calls, billed twice, and whichever
-- finishes last clobbers the other's artifact. It only survives because steps
-- usually finish inside the 2-minute cron gap — which is luck, not design.
--
-- FOR UPDATE SKIP LOCKED makes the read-and-claim one atomic operation: a row
-- another transaction is already claiming is skipped rather than waited on, so
-- concurrent ticks pick up *different* work instead of colliding.
--
-- The lease (locked_until) covers the case the row lock can't: the transaction
-- commits, then the serverless function dies mid-step. The row would otherwise
-- sit 'running' forever; instead the lease expires and it becomes claimable.
--
-- SECURITY DEFINER + service-role-only: crons call this, users never do.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_content_jobs(
  max_jobs   INTEGER DEFAULT 4,
  lease_secs INTEGER DEFAULT 300
)
RETURNS SETOF public.content_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimable AS (
    SELECT id
      FROM public.content_jobs
     WHERE status IN ('queued', 'running')
       -- Backoff: not due yet.
       AND run_after <= NOW()
       -- Free, or the previous holder's lease has expired.
       AND (locked_until IS NULL OR locked_until < NOW())
     ORDER BY run_after ASC
     LIMIT max_jobs
     -- The important part. Without it this is the SEO race.
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.content_jobs j
     SET status       = 'running',
         locked_until = NOW() + make_interval(secs => lease_secs),
         updated_at   = NOW()
    FROM claimable c
   WHERE j.id = c.id
  RETURNING j.*;
$$;

-- Crons authenticate as the service role, which bypasses RLS. No user-facing
-- role should ever be able to claim jobs.
REVOKE ALL ON FUNCTION public.claim_content_jobs(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_content_jobs(INTEGER, INTEGER) FROM anon, authenticated;

COMMENT ON FUNCTION public.claim_content_jobs(INTEGER, INTEGER) IS
  'Atomically claim up to max_jobs due content jobs, taking a lease. FOR UPDATE SKIP LOCKED is what stops two overlapping cron ticks from running — and billing — the same step twice.';
