-- Close three tables that shipped with NO row-level security.
--
-- Verified against production before writing this: pg_class.relrowsecurity was
-- false and pg_policies returned zero rows for all three. Because signup is
-- public, any authenticated user could read every tenant's rows with the anon
-- key — and sms_conversations/sms_messages are in the supabase_realtime
-- publication, so Postgres was streaming other tenants' customer names, phone
-- numbers and message bodies into their browsers live.
--
-- Enabling RLS also fixes the Realtime leak: postgres_changes honours RLS, so
-- once a policy exists a subscriber only receives rows it is allowed to read.
--
-- Access model per table:
--   sms_conversations / sms_messages — read+write by src/lib/actions/sms.ts via
--     the USER client, so they need a real member policy. Workers are excluded:
--     SMS is customer communication, and worker isolation is meant to keep
--     workers away from customer contact details (CLAUDE.md).
--   report_sessions — only ever touched by the ADMIN client
--     (src/app/api/report-sessions/**), which bypasses RLS. So the correct
--     policy is none at all: RLS on with no policy = deny everyone except the
--     service role. Same shape already used for business_api_keys and
--     oauth_codes.

-- ── sms_conversations ───────────────────────────────────────────────────────
ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_conversations_no_workers" ON public.sms_conversations;
CREATE POLICY "sms_conversations_no_workers" ON public.sms_conversations
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
    )
    AND NOT public.is_business_worker(business_id)
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
    )
    AND NOT public.is_business_worker(business_id)
  );

-- ── sms_messages ────────────────────────────────────────────────────────────
-- Carries its own business_id, so it is gated directly rather than through a
-- join on the conversation — one less way for the two to disagree.
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_messages_no_workers" ON public.sms_messages;
CREATE POLICY "sms_messages_no_workers" ON public.sms_messages
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
    )
    AND NOT public.is_business_worker(business_id)
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
    )
    AND NOT public.is_business_worker(business_id)
  );

-- ── report_sessions ─────────────────────────────────────────────────────────
-- Deliberately NO policy. Service-role only.
ALTER TABLE public.report_sessions ENABLE ROW LEVEL SECURITY;
