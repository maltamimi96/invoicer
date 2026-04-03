-- Fix infinite recursion in business_members RLS policies.
-- The old policies queried business_members from within a business_members policy → recursion.
-- Solution: a SECURITY DEFINER helper that runs as postgres (bypasses RLS).

-- 1. Helper: returns true if uid is an active admin of biz_id
CREATE OR REPLACE FUNCTION public.is_business_admin(biz_id uuid, uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = biz_id
      AND user_id    = uid
      AND role       = 'admin'
      AND status     = 'active'
  );
$$;

-- 2. Drop the recursive policies
DROP POLICY IF EXISTS "bm_select" ON public.business_members;
DROP POLICY IF EXISTS "bm_insert" ON public.business_members;
DROP POLICY IF EXISTS "bm_update" ON public.business_members;
DROP POLICY IF EXISTS "bm_delete" ON public.business_members;

-- 3. Recreate without self-referencing subqueries
CREATE POLICY "bm_select" ON public.business_members
  FOR SELECT USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR public.is_business_admin(business_id, auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "bm_insert" ON public.business_members
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR public.is_business_admin(business_id, auth.uid())
  );

CREATE POLICY "bm_update" ON public.business_members
  FOR UPDATE USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR public.is_business_admin(business_id, auth.uid())
  );

CREATE POLICY "bm_delete" ON public.business_members
  FOR DELETE USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR public.is_business_admin(business_id, auth.uid())
  );
