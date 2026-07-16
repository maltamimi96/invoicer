-- Make seo_keyword_snapshots safe for a repeating GSC sync.
--
-- Search Console restates the last ~3 days of data, so the nightly sync pulls a
-- trailing window and re-writes rows it has already seen. Without a unique key
-- that duplicates every keyword every night. With it, the sync upserts.
--
-- Safe as a plain (non-concurrent) index: the table has never had a producer —
-- verified 0 rows before applying.
CREATE UNIQUE INDEX IF NOT EXISTS seo_keyword_snapshots_unique_daily
  ON public.seo_keyword_snapshots (site_id, keyword, captured_at);

-- Page-level dimension. Nullable + additive: the query-only sync leaves it
-- NULL. The Opportunity Scout follow-up needs it to say "rewrite THIS page's
-- title" for high-impression/low-CTR pages.
ALTER TABLE public.seo_keyword_snapshots
  ADD COLUMN IF NOT EXISTS page TEXT;
