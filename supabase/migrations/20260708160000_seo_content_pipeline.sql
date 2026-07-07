-- SEO content pipeline execution (docs/SEO_AGENCY_PLAN.md, Phase 2.3).
--
-- Additive columns on seo_content_pieces so a piece can move through the agent
-- pipeline: which content type, the topic, the current stage, an overall
-- pipeline status, the driving job, and the artifacts each agent produces
-- (a map of artifact_key -> { content, created_at }). Additive only.

ALTER TABLE public.seo_content_pieces
  ADD COLUMN IF NOT EXISTS content_type    TEXT NOT NULL DEFAULT 'blog'
    CHECK (content_type IN ('blog','landing','email','social')),
  ADD COLUMN IF NOT EXISTS topic           TEXT,
  ADD COLUMN IF NOT EXISTS current_stage   TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (pipeline_status IN ('idle','running','awaiting_approval','done','failed')),
  ADD COLUMN IF NOT EXISTS job_id          UUID,
  ADD COLUMN IF NOT EXISTS artifacts       JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_seo_content_pipeline_status
  ON public.seo_content_pieces (business_id, pipeline_status);
