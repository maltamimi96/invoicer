-- ============================================================================
-- Worker role + data isolation
--
-- Adds 'worker' as a member role. Workers belong to a business but only see
-- work orders assigned to them; everything else is hidden at the RLS layer so
-- direct API calls can't leak data either. Member profiles auto-link to auth
-- users on first login so a worker's existing profile lights up automatically.
-- Idempotent — safe to re-run.
-- ============================================================================

-- ─── 1. Allow 'worker' in business_members.role ────────────────────────────
ALTER TABLE public.business_members
  DROP CONSTRAINT IF EXISTS business_members_role_check;
ALTER TABLE public.business_members
  ADD  CONSTRAINT business_members_role_check
  CHECK (role IN ('admin', 'editor', 'viewer', 'worker'));

-- ─── 2. Helper: is the caller a worker in this business? ───────────────────
-- SECURITY DEFINER so the lookup always sees business_members regardless of
-- the calling user's RLS view (avoids recursion in policies that reference
-- business_members itself).
CREATE OR REPLACE FUNCTION public.is_business_worker(biz_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = biz_id
      AND user_id     = auth.uid()
      AND status      = 'active'
      AND role        = 'worker'
  );
$$;

-- ─── 3. Helper: profile ids that belong to the calling worker ──────────────
-- Used by work_orders policies. SECURITY DEFINER so we can read the profile.
CREATE OR REPLACE FUNCTION public.my_member_profile_ids(biz_id UUID)
RETURNS SETOF UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.member_profiles
  WHERE business_id = biz_id
    AND user_id     = auth.uid();
$$;

-- ─── 4. Auto-link member_profiles to the caller by matching email ──────────
-- Mirrors activate_pending_memberships() — call on every dashboard load.
CREATE OR REPLACE FUNCTION public.link_my_member_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.member_profiles
  SET    user_id = auth.uid()
  WHERE  user_id IS NULL
    AND  lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()));
END;
$$;

-- ─── 5. Tighten RLS on sensitive tables: deny workers ──────────────────────
-- Pattern: drop the existing "owners OR active members" policy and replace
-- with the same predicate AND NOT is_business_worker(business_id).

-- helper macro is ugly in plain SQL, so we just spell each table out

-- customers ─────
DROP POLICY IF EXISTS "Business members can manage customers" ON public.customers;
CREATE POLICY "customers_no_workers" ON public.customers
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

-- products
DROP POLICY IF EXISTS "Business members can manage products" ON public.products;
CREATE POLICY "products_no_workers" ON public.products
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

-- invoices
DROP POLICY IF EXISTS "Business members can manage invoices" ON public.invoices;
CREATE POLICY "invoices_no_workers" ON public.invoices
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

-- quotes
DROP POLICY IF EXISTS "Business members can manage quotes" ON public.quotes;
CREATE POLICY "quotes_no_workers" ON public.quotes
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

-- payments
DROP POLICY IF EXISTS "Business members can manage payments" ON public.payments;
CREATE POLICY "payments_no_workers" ON public.payments
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

-- reports
DROP POLICY IF EXISTS "Business members can manage reports" ON public.reports;
CREATE POLICY "reports_no_workers" ON public.reports
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

-- ─── 6. work_orders: workers see only their own ───────────────────────────
-- Replace the broad policy with two: a non-worker FOR ALL policy, and a
-- worker-only FOR SELECT/UPDATE policy that restricts to assigned rows.
DROP POLICY IF EXISTS "work_orders_all" ON public.work_orders;

CREATE POLICY "work_orders_non_worker_all" ON public.work_orders
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

-- Workers can SELECT only assigned rows
CREATE POLICY "work_orders_worker_select" ON public.work_orders
  FOR SELECT
  USING (
    public.is_business_worker(business_id)
    AND (
      assigned_to_profile_id IN (SELECT public.my_member_profile_ids(business_id))
      OR id IN (
        SELECT work_order_id FROM public.work_order_assignments
        WHERE member_profile_id IN (SELECT public.my_member_profile_ids(business_id))
      )
    )
  );

-- Workers can UPDATE their assigned rows (for status submit, photos, etc.)
CREATE POLICY "work_orders_worker_update" ON public.work_orders
  FOR UPDATE
  USING (
    public.is_business_worker(business_id)
    AND (
      assigned_to_profile_id IN (SELECT public.my_member_profile_ids(business_id))
      OR id IN (
        SELECT work_order_id FROM public.work_order_assignments
        WHERE member_profile_id IN (SELECT public.my_member_profile_ids(business_id))
      )
    )
  );

-- ─── 7. work_order_assignments: workers see their own rows ─────────────────
DO $$ BEGIN
  CREATE POLICY "woa_worker_select" ON public.work_order_assignments
    FOR SELECT
    USING (
      public.is_business_worker(business_id)
      AND member_profile_id IN (SELECT public.my_member_profile_ids(business_id))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
