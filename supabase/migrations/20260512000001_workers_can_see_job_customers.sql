-- ============================================================================
-- Let workers SELECT (read-only) customers that are linked to a work order
-- they're assigned to.
--
-- The existing `customers_no_workers` policy hard-blocks all worker access to
-- the customers table. That keeps a worker from browsing the customer list
-- (correct), but it also hides the customer's name + phone + email from the
-- worker's own job-detail screen — which they need to actually do their job
-- (call the customer when running late, etc.).
--
-- Solution: add a permissive SELECT policy that lets a worker read just the
-- customer rows attached to their assigned jobs. Insert/update/delete remain
-- blocked.
-- ============================================================================

DROP POLICY IF EXISTS "workers_can_see_job_customers" ON public.customers;
CREATE POLICY "workers_can_see_job_customers" ON public.customers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.work_orders wo
        JOIN public.work_order_assignments woa ON woa.work_order_id = wo.id
        JOIN public.member_profiles mp         ON mp.id = woa.member_profile_id
       WHERE wo.customer_id = customers.id
         AND wo.business_id = customers.business_id
         AND mp.user_id = auth.uid()
    )
  );
