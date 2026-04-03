-- ============================================================================
-- Migration: member_profiles + work_order_updates
-- Idempotent — safe to run multiple times
-- ============================================================================

-- ─── 1. member_profiles ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.member_profiles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id      UUID,       -- null until member accepts invite / signs up
  email        TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  phone        TEXT,
  avatar_url   TEXT,
  role_title   TEXT,
  skills       TEXT[]      NOT NULL DEFAULT '{}',
  bio          TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, email)
);

ALTER TABLE public.member_profiles ENABLE ROW LEVEL SECURITY;

-- Any active business member can read profiles
DO $$ BEGIN
  CREATE POLICY "mp_select" ON public.member_profiles FOR SELECT
    USING (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION
        SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Workers can update their own profile
DO $$ BEGIN
  CREATE POLICY "mp_self_update" ON public.member_profiles FOR UPDATE
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Owner or admin can insert/update/delete any profile
DO $$ BEGIN
  CREATE POLICY "mp_admin_write" ON public.member_profiles FOR ALL
    USING (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION
        SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
      )
    )
    WITH CHECK (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION
        SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Add assigned_to_profile_id to work_orders ────────────────────────────

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS assigned_to_profile_id UUID REFERENCES public.member_profiles(id) ON DELETE SET NULL;

-- ─── 3. work_order_updates ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.work_order_updates (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  UUID        NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  business_id    UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  author_user_id UUID,
  author_email   TEXT        NOT NULL DEFAULT '',
  author_name    TEXT        NOT NULL DEFAULT '',
  content        TEXT        NOT NULL DEFAULT '',
  photos         JSONB       NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.work_order_updates ENABLE ROW LEVEL SECURITY;

-- Any active business member can read updates (app enforces finer grained on server)
DO $$ BEGIN
  CREATE POLICY "wou_select" ON public.work_order_updates FOR SELECT
    USING (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION
        SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Any active business member can insert (server action enforces who can add)
DO $$ BEGIN
  CREATE POLICY "wou_insert" ON public.work_order_updates FOR INSERT
    WITH CHECK (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION
        SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only owner/admin can delete (moderation)
DO $$ BEGIN
  CREATE POLICY "wou_delete" ON public.work_order_updates FOR DELETE
    USING (
      business_id IN (
        SELECT id FROM public.businesses WHERE user_id = auth.uid()
        UNION
        SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
