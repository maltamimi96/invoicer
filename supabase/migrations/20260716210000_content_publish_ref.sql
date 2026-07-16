-- Remember WHERE a piece was published, so it can be unpublished later.
--
-- publishContent only ever stored `published_url` (a human link), which is not
-- enough to undo a publish: WordPress/Sanity/Payload need the provider-side id,
-- and we never recorded which connection did the publishing.
--
-- Both additive + nullable. Pieces published before this stay unpublishable via
-- the provider (the UI says so plainly) — except GitHub, where the file path is
-- deterministic from the connection's content_path + the slug.
ALTER TABLE public.seo_content_pieces
  ADD COLUMN IF NOT EXISTS published_connection_id UUID REFERENCES public.seo_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_ref TEXT;

COMMENT ON COLUMN public.seo_content_pieces.published_ref IS
  'Provider-side handle for the published item: repo file path (git), post id (wordpress), document id (sanity/payload).';
