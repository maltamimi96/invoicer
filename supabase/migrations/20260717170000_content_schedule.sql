-- Content Studio: the schedule model.
--
-- Phase 2 is auto-posting to Meta/TikTok/LinkedIn/YouTube. Those connectors are
-- gated on platform review queues outside our control, so the schedule lands
-- first and the connectors become purely additive: a poster reads
-- content_variations WHERE status='approved' AND scheduled_at <= now() AND
-- posted_at IS NULL. Until then "mark as posted" is the manual path and the
-- same rows carry it.

-- The date a campaign intends a piece to go out. Carried onto each of the
-- piece's variations when the platform adapter writes them, so a planned
-- campaign arrives on the calendar without anyone scheduling 12 cards by hand.
ALTER TABLE public.content_pieces
  ADD COLUMN IF NOT EXISTS publish_on DATE;

-- The calendar reads a date window per business; without this it seq-scans
-- every variation the business has ever generated. Mirrors the hot-path index
-- set in 20260511020000_perf_indexes.sql.
CREATE INDEX IF NOT EXISTS content_variations_schedule_idx
  ON public.content_variations (business_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- The poster's query, once connectors exist: due, approved, not yet posted.
CREATE INDEX IF NOT EXISTS content_variations_due_idx
  ON public.content_variations (scheduled_at)
  WHERE status = 'approved' AND posted_at IS NULL;

-- Campaign hubs list their pieces.
CREATE INDEX IF NOT EXISTS content_pieces_campaign_idx
  ON public.content_pieces (campaign_id)
  WHERE campaign_id IS NOT NULL;
