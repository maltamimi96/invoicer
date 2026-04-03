-- Team members: allow business owners to add workers with roles

-- 1. business_members table
CREATE TABLE public.business_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  added_by    UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, email)
);

ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

-- SELECT: business owners, admins, or the member themselves
CREATE POLICY "bm_select" ON public.business_members
  FOR SELECT USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR business_id IN (
      SELECT business_id FROM public.business_members bm2
      WHERE bm2.user_id = auth.uid() AND bm2.role = 'admin' AND bm2.status = 'active'
    )
    OR user_id = auth.uid()
  );

-- INSERT / UPDATE / DELETE: business owners and admins only
CREATE POLICY "bm_insert" ON public.business_members
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR business_id IN (
      SELECT business_id FROM public.business_members bm2
      WHERE bm2.user_id = auth.uid() AND bm2.role = 'admin' AND bm2.status = 'active'
    )
  );

CREATE POLICY "bm_update" ON public.business_members
  FOR UPDATE USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR business_id IN (
      SELECT business_id FROM public.business_members bm2
      WHERE bm2.user_id = auth.uid() AND bm2.role = 'admin' AND bm2.status = 'active'
    )
  );

CREATE POLICY "bm_delete" ON public.business_members
  FOR DELETE USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR business_id IN (
      SELECT business_id FROM public.business_members bm2
      WHERE bm2.user_id = auth.uid() AND bm2.role = 'admin' AND bm2.status = 'active'
    )
  );

-- 2. Update RLS on data tables: owners OR active members can access
DROP POLICY IF EXISTS "Business members can manage customers" ON public.customers;
CREATE POLICY "Business members can manage customers" ON public.customers
  FOR ALL
  USING (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ));

DROP POLICY IF EXISTS "Business members can manage products" ON public.products;
CREATE POLICY "Business members can manage products" ON public.products
  FOR ALL
  USING (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ));

DROP POLICY IF EXISTS "Business members can manage invoices" ON public.invoices;
CREATE POLICY "Business members can manage invoices" ON public.invoices
  FOR ALL
  USING (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ));

DROP POLICY IF EXISTS "Business members can manage quotes" ON public.quotes;
CREATE POLICY "Business members can manage quotes" ON public.quotes
  FOR ALL
  USING (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ));

DROP POLICY IF EXISTS "Business members can manage payments" ON public.payments;
CREATE POLICY "Business members can manage payments" ON public.payments
  FOR ALL
  USING (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ));

DROP POLICY IF EXISTS "Business members can manage reports" ON public.reports;
CREATE POLICY "Business members can manage reports" ON public.reports
  FOR ALL
  USING (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status = 'active'
  ));

-- 3. RPC: activate pending memberships for the currently logged-in user
--    Called from the dashboard layout on every page load (cheap no-op if nothing pending)
CREATE OR REPLACE FUNCTION public.activate_pending_memberships()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.business_members
  SET    user_id = auth.uid(),
         status  = 'active'
  WHERE  lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  AND    status   = 'pending'
  AND    user_id  IS NULL;
END;
$$;
