-- Every hunt result was being thrown away.
--
-- `uq_prospect_candidates_place` was a PARTIAL unique index
-- (`... WHERE place_id IS NOT NULL`). Postgres will not use a partial index as
-- an ON CONFLICT arbiter unless the statement repeats the index predicate, and
-- PostgREST doesn't emit one — so every upsert from the runner raised
--
--     there is no unique or exclusion constraint matching the ON CONFLICT
--     specification                                                (SQLSTATE 42P10)
--
-- Verified against this database on a temp table carrying each index shape:
-- partial → rejected, total → accepted.
--
-- The runner didn't check the error, so a hunt searched Google, screened 93
-- businesses, paid an agent to judge 5 of them, reported "5 to review", billed
-- 45 cents — and persisted nothing. prospect_candidates had zero rows.
--
-- A plain unique index is inferable and keeps the semantics: in Postgres NULLs
-- are distinct by default, so rows with no place_id still don't collide, which
-- is the only thing the WHERE clause was buying.

DROP INDEX IF EXISTS public.uq_prospect_candidates_place;

CREATE UNIQUE INDEX IF NOT EXISTS uq_prospect_candidates_place
  ON public.prospect_candidates (business_id, place_id);

COMMENT ON INDEX public.uq_prospect_candidates_place IS
  'One row per business per place. Deliberately NOT partial: a partial index cannot be an ON CONFLICT arbiter, and the upsert in lib/prospecting/run.ts depends on it.';
