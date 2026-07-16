-- ============================================================================
-- Assistant conversations
--
-- The AI assistant had no persistence at all: history lived in useState, so a
-- refresh destroyed the conversation. It also lost its memory *between turns*,
-- because the client only kept the final text of each reply and dropped every
-- tool_use / tool_result block.
--
-- Hence `content` is JSONB, not TEXT. It stores the full Anthropic content
-- block array verbatim. Flattening it to text is exactly the bug being fixed —
-- the agent must be able to see the tool calls it already made and reuse the
-- IDs they returned instead of searching again.
--
-- `change_log` mirrors cleanup_runs (20260505000001) so undoCleanup's proven
-- reverse-replay applies unchanged to assistant actions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  title       TEXT,                       -- NULL until the first turn names it
  model       TEXT,                       -- last model used, to restore the picker
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  -- Denormalised so RLS can gate a message without joining its conversation.
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  -- The full Anthropic content block array. See the note above: this is JSONB
  -- rather than TEXT on purpose.
  content         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  seq             INTEGER     NOT NULL,   -- ordering within the conversation
  model           TEXT,
  -- Same entry shape as cleanup_runs.change_log:
  --   {change_id, op:'update'|'delete'|'merge', table, before, after, fk_updates?}
  change_log      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  undone_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (conversation_id, seq)
);

-- Hot paths: list a user's conversations newest-first, and replay one in order.
CREATE INDEX IF NOT EXISTS assistant_conversations_user_idx
  ON public.assistant_conversations (business_id, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS assistant_conversations_business_idx
  ON public.assistant_conversations (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assistant_messages_conversation_idx
  ON public.assistant_messages (conversation_id, seq);

CREATE INDEX IF NOT EXISTS assistant_messages_business_idx
  ON public.assistant_messages (business_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Two gates, both required:
--
--  1. user_id = auth.uid() — a conversation is private to whoever had it. An
--     owner has no business reading an admin's chat history.
--  2. NOT is_business_worker() — the mandatory no-workers pattern from
--     20260430000001. Workers are hard-isolated, and a transcript would leak
--     exactly the customer and invoice data that isolation exists to protect.
--     (/api/assistant also denies workers outright; this is defence in depth.)

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_conversations_own ON public.assistant_conversations;
CREATE POLICY assistant_conversations_own ON public.assistant_conversations FOR ALL
  USING (
    user_id = auth.uid()
    AND business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
    AND NOT public.is_business_worker(business_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
    AND NOT public.is_business_worker(business_id)
  );

DROP POLICY IF EXISTS assistant_messages_own ON public.assistant_messages;
CREATE POLICY assistant_messages_own ON public.assistant_messages FOR ALL
  USING (
    user_id = auth.uid()
    AND business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
    AND NOT public.is_business_worker(business_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
    AND NOT public.is_business_worker(business_id)
  );

COMMENT ON COLUMN public.assistant_messages.content IS
  'Full Anthropic content block array (text/tool_use/tool_result/thinking). Never flatten to text — the tool blocks are the agent''s cross-turn memory.';

COMMENT ON COLUMN public.assistant_messages.change_log IS
  'Reversible mutations this turn made. Same entry shape as cleanup_runs.change_log so undoCleanup''s reverse replay applies unchanged.';
