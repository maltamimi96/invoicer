-- ============================================================================
-- Lead deduplication
--
-- Same prospect was getting captured multiple times — different Message-IDs
-- from the same sender, the same person reaching us via Airtasker AND email,
-- or manual entry on top of an inbox import. Fix it at the data layer:
--
-- 1. lead_identity_key()  — deterministic key from email > phone > name+address
-- 2. Stored generated column on leads
-- 3. Unique index per (business_id, identity_key)
-- 4. Tracking columns: sources[], source_refs jsonb, last_seen_at
-- 5. Backfill + collapse existing duplicate clusters into the oldest row
-- 6. upsert_lead() RPC: single entry point for all ingest paths (manual,
--    email cron, /api/v1/leads). Fills nulls in the existing row, never
--    overwrites user edits, appends source + ref + bumps last_seen_at.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ─── 1. Identity key function ─────────────────────────────────────────────
-- Priority: email > phone > name+address. Returns NULL when we have nothing
-- distinctive enough to dedup on, which deliberately disables the unique
-- index for that row (we'd rather keep an "anonymous" lead than wrongly
-- merge two unrelated ones).
CREATE OR REPLACE FUNCTION public.lead_identity_key(
  p_email   TEXT,
  p_phone   TEXT,
  p_name    TEXT,
  p_address TEXT
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_email IS NOT NULL AND btrim(p_email) <> ''
      THEN 'email:' || lower(btrim(p_email))
    WHEN p_phone IS NOT NULL AND regexp_replace(p_phone, '\D', '', 'g') <> ''
      THEN 'phone:' || regexp_replace(p_phone, '\D', '', 'g')
    WHEN p_name    IS NOT NULL AND btrim(p_name)    <> ''
     AND p_address IS NOT NULL AND btrim(p_address) <> ''
      THEN 'name:' ||
           lower(regexp_replace(btrim(p_name) || '|' || btrim(p_address), '\s+', ' ', 'g'))
    ELSE NULL
  END;
$$;

-- ─── 2. Add tracking columns + generated identity_key ─────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sources       TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_refs   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- The generated column has to exist before backfill so it can collapse on it.
DO $$ BEGIN
  ALTER TABLE public.leads
    ADD COLUMN identity_key TEXT GENERATED ALWAYS AS (
      public.lead_identity_key(email, phone, name, address)
    ) STORED;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ─── 3. Backfill: seed sources + source_refs from existing data ───────────
UPDATE public.leads
SET sources = ARRAY[source]::TEXT[]
WHERE source IS NOT NULL
  AND (sources IS NULL OR cardinality(sources) = 0);

UPDATE public.leads
SET source_refs = jsonb_build_array(jsonb_build_object(
      'source',     source,
      'message_id', source_message_id,
      'at',         created_at
    ))
WHERE jsonb_typeof(source_refs) = 'array'
  AND jsonb_array_length(source_refs) = 0
  AND source IS NOT NULL;

UPDATE public.leads
SET last_seen_at = updated_at
WHERE last_seen_at < updated_at;

-- ─── 4. Collapse existing duplicate clusters ──────────────────────────────
DO $$
DECLARE
  c          RECORD;
  v_keeper   UUID;
  v_sources  TEXT[];
  v_refs     JSONB;
  v_last     TIMESTAMPTZ;
BEGIN
  FOR c IN
    SELECT business_id, identity_key
    FROM   public.leads
    WHERE  identity_key IS NOT NULL
    GROUP  BY business_id, identity_key
    HAVING COUNT(*) > 1
  LOOP
    -- Pick the oldest row as the survivor.
    SELECT id INTO v_keeper
    FROM   public.leads
    WHERE  business_id  = c.business_id
      AND  identity_key = c.identity_key
    ORDER  BY created_at ASC
    LIMIT  1;

    -- Aggregate every distinct source + every ref + the latest activity.
    SELECT ARRAY(
      SELECT DISTINCT s
      FROM (
        SELECT unnest(COALESCE(sources, ARRAY[source]::TEXT[])) AS s
        FROM   public.leads
        WHERE  business_id  = c.business_id
          AND  identity_key = c.identity_key
      ) sources_flat
      WHERE s IS NOT NULL
    ) INTO v_sources;

    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_refs
    FROM (
      SELECT jsonb_array_elements(COALESCE(source_refs, '[]'::jsonb)) AS r
      FROM   public.leads
      WHERE  business_id  = c.business_id
        AND  identity_key = c.identity_key
    ) refs_flat;

    SELECT MAX(updated_at) INTO v_last
    FROM   public.leads
    WHERE  business_id  = c.business_id
      AND  identity_key = c.identity_key;

    -- Update the survivor with merged data, then drop the rest.
    UPDATE public.leads
    SET    sources      = v_sources,
           source_refs  = v_refs,
           last_seen_at = v_last,
           updated_at   = NOW()
    WHERE  id = v_keeper;

    DELETE FROM public.leads
    WHERE  business_id  = c.business_id
      AND  identity_key = c.identity_key
      AND  id <> v_keeper;
  END LOOP;
END $$;

-- ─── 5. Unique index on (business_id, identity_key) ───────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS leads_business_identity_key_idx
  ON public.leads (business_id, identity_key)
  WHERE identity_key IS NOT NULL;

-- ─── 6. Single ingest entry point: upsert_lead() ──────────────────────────
-- Called from createLead, the email-leads cron, and /api/v1/leads. Computes
-- the identity_key, finds an existing match, and either inserts a new row
-- or merges the new payload into the existing one (filling nulls, never
-- stomping user edits, appending the new source + ref).
CREATE OR REPLACE FUNCTION public.upsert_lead(
  p_business_id      UUID,
  p_user_id          UUID,
  p_name             TEXT,
  p_email            TEXT DEFAULT NULL,
  p_phone            TEXT DEFAULT NULL,
  p_address          TEXT DEFAULT NULL,
  p_suburb           TEXT DEFAULT NULL,
  p_service          TEXT DEFAULT NULL,
  p_property_type    TEXT DEFAULT NULL,
  p_timing           TEXT DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL,
  p_source           TEXT DEFAULT 'manual',
  p_source_ref       TEXT DEFAULT NULL
)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_key      TEXT;
  v_existing public.leads;
  v_result   public.leads;
  v_ref      JSONB;
BEGIN
  v_key := public.lead_identity_key(p_email, p_phone, p_name, p_address);
  v_ref := jsonb_build_object(
    'source', p_source,
    'ref',    p_source_ref,
    'at',     to_jsonb(NOW())
  );

  -- Try to find existing match (only when we have an identity to dedup on).
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM   public.leads
    WHERE  business_id = p_business_id
      AND  identity_key = v_key
    LIMIT  1;
  END IF;

  IF v_existing.id IS NULL THEN
    -- Fresh insert
    INSERT INTO public.leads (
      business_id, user_id, name, email, phone, suburb, address,
      service, property_type, timing, notes,
      status, source, source_message_id,
      sources, source_refs, last_seen_at
    ) VALUES (
      p_business_id, p_user_id, p_name, p_email, p_phone, p_suburb, p_address,
      p_service, p_property_type, p_timing, p_notes,
      'new', p_source, p_source_ref,
      ARRAY[p_source]::TEXT[], jsonb_build_array(v_ref), NOW()
    )
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  -- Merge into existing — only fill nulls, append new source + ref.
  UPDATE public.leads
  SET email         = COALESCE(NULLIF(btrim(email),   ''), p_email),
      phone         = COALESCE(NULLIF(btrim(phone),   ''), p_phone),
      suburb        = COALESCE(NULLIF(btrim(suburb),  ''), p_suburb),
      address       = COALESCE(NULLIF(btrim(address), ''), p_address),
      service       = COALESCE(NULLIF(btrim(service), ''), p_service),
      property_type = COALESCE(NULLIF(btrim(property_type), ''), p_property_type),
      timing        = COALESCE(NULLIF(btrim(timing),  ''), p_timing),
      notes         = CASE
                        WHEN p_notes IS NULL OR btrim(p_notes) = '' THEN notes
                        WHEN notes  IS NULL OR btrim(notes)   = '' THEN p_notes
                        ELSE notes
                          || E'\n\n--- (also from ' || p_source
                          || COALESCE(' · ' || p_source_ref, '')
                          || ') ---\n' || p_notes
                      END,
      sources       = (
                        SELECT ARRAY(SELECT DISTINCT s
                                     FROM unnest(sources || ARRAY[p_source]::TEXT[]) AS s
                                     WHERE s IS NOT NULL)
                      ),
      source_refs   = source_refs || v_ref,
      last_seen_at  = NOW(),
      updated_at    = NOW()
  WHERE id = v_existing.id
  RETURNING * INTO v_result;

  RETURN v_result;
END $$;

-- ─── 7. Helper view for the UI (optional) ─────────────────────────────────
-- COMMENTED OUT — leave the existing select usages alone.
-- CREATE OR REPLACE VIEW public.leads_with_history AS
--   SELECT *, cardinality(sources) AS source_count FROM public.leads;
