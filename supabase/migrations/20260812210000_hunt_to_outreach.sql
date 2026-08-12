-- Join the two halves: a hunt can now feed a sequence, and run itself.
--
-- Prospecting could find businesses and Outreach could email them, and nothing
-- carried one to the other — Places never returns an email, and autoEnroll
-- filters on `.not(email, is, null)`, so every prospect a hunt found was
-- permanently ineligible for a sequence. The email finder
-- (lib/prospecting/email-finder.ts) closes that gap; these columns are how a
-- hunt says what to DO with what it finds.

ALTER TABLE public.prospect_hunts
  -- Which outreach CAMPAIGN approved prospects join.
  --
  -- A campaign rather than a sequence, for two reasons: outreach_enrollments
  -- requires campaign_id NOT NULL, and a campaign is the right unit anyway —
  -- it already carries the sequence, the daily cap, and a status you can pause
  -- without touching the hunt. "A different pitch for strata than for
  -- builders" is then one campaign per hunt, each naming its own sequence.
  ADD COLUMN IF NOT EXISTS campaign_id UUID
    REFERENCES public.outreach_campaigns(id) ON DELETE SET NULL,

  -- Approving a candidate enriches it and enrols it in one action.
  ADD COLUMN IF NOT EXISTS auto_enrol BOOLEAN NOT NULL DEFAULT FALSE,

  -- Verified candidates skip the review queue entirely. OFF by default and it
  -- should stay off until a hunt has proved its criteria over a few runs —
  -- this is the switch that turns a careful tool into a machine that cold-
  -- emails whoever a bad criteria string matched.
  ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN NOT NULL DEFAULT FALSE,

  -- ── Scheduling ──────────────────────────────────────────────────────────
  -- Days of the week this hunt runs: 0=Sunday … 6=Saturday. Empty means
  -- manual only.
  --
  -- This is deliberately per-hunt rather than a rotation inside one hunt.
  -- "Monday builders, Tuesday strata, Wednesday real estate" is then three
  -- hunts with three schedules — each with its own criteria, its own filters
  -- and its own sequence — instead of one hunt with a rotating query list and
  -- one pitch for everybody. It also means a day can hold two hunts, or none.
  ADD COLUMN IF NOT EXISTS run_days SMALLINT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS run_hour SMALLINT NOT NULL DEFAULT 9
    CONSTRAINT prospect_hunts_run_hour CHECK (run_hour BETWEEN 0 AND 23),
  -- Local to the business: "9am" must mean 9am where the operator is, not
  -- 9am UTC. The digest cron shipped without this and arrives at 5pm Sydney.
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;

COMMENT ON COLUMN public.prospect_hunts.run_days IS
  '0=Sun..6=Sat, in the hunt''s own timezone. Empty = manual only.';
COMMENT ON COLUMN public.prospect_hunts.auto_approve IS
  'Verified candidates bypass the review queue. Off by default, deliberately.';

-- The scheduler asks "which hunts are due" every hour; it should not scan.
CREATE INDEX IF NOT EXISTS idx_prospect_hunts_scheduled
  ON public.prospect_hunts (active, run_hour)
  WHERE active AND array_length(run_days, 1) > 0;

-- ── Where a prospect came from, and what we know about its address ────────
ALTER TABLE public.prospects
  -- When we last looked for an email, so a nightly job doesn't re-crawl a site
  -- that had none. Distinct from "has no email": one is a fact, the other is
  -- the absence of an attempt.
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ,
  -- 'places' | 'crawl' | 'manual' | 'import' — an audit trail for how an
  -- address was obtained, which is exactly what the Spam Act conversation
  -- turns on.
  ADD COLUMN IF NOT EXISTS email_source TEXT,
  ADD COLUMN IF NOT EXISTS hunt_id UUID
    REFERENCES public.prospect_hunts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.prospects.email_source IS
  'How the address was obtained. crawl = read from the business''s own published contact page.';

-- The prospects list wants "contacted or not" at a glance, which means
-- ordering by last_contacted_at within a business.
CREATE INDEX IF NOT EXISTS idx_prospects_contacted
  ON public.prospects (business_id, last_contacted_at DESC NULLS FIRST);
