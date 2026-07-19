-- Worker isolation: close the four tables it was never applied to.
--
-- CLAUDE.md documents "worker" as a hard-isolation role that only ever sees the
-- work orders assigned to it. That guarantee is enforced by adding
-- `AND NOT public.is_business_worker(business_id)` to each table's policy —
-- done in 20260430000001 for customers, products, invoices, quotes, payments
-- and reports, and never done for these four.
--
-- Verified against production before writing: pg_policies shows the sole policy
-- on each of leads / contacts / sites / recurring_jobs has no is_business_worker
-- clause. The web app masks these by path (WORKER_ALLOWED_PATHS in
-- src/lib/permissions.ts allows only /dashboard, /work-orders, /schedule, /help,
-- /settings/profile) — but mobile queries PostgREST directly with the worker's
-- own JWT, so the path list is not a security boundary. Half the documented
-- guarantee was not real.
--
-- DELIBERATELY NOT INCLUDED — `tasks`:
--   An audit finding claimed its write policies name roles that do not exist
--   ('admin','manager','staff') so editors fail silently. That is wrong.
--   `tasks_all` is a permissive FOR ALL policy for any active member, and
--   Postgres OR's permissive policies together — so it already grants everything
--   and the role-specific policies add nothing. The real issue is the opposite
--   (a viewer can write tasks, and three policies are dead code naming roles
--   outside the Role union). That is a permissions design decision, not a
--   tenancy leak, so it is not bundled into a safety migration.

-- ── leads ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "leads_business_access" ON public.leads;
CREATE POLICY "leads_no_workers" ON public.leads
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

-- ── contacts ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "contacts_all" ON public.contacts;
CREATE POLICY "contacts_no_workers" ON public.contacts
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

-- ── sites ───────────────────────────────────────────────────────────────────
-- Serviced addresses, including access notes and gate codes. Workers reach a
-- job's address through work_orders.property_address, not through this table:
-- the only mobile query on sites is the customer-detail screen, which workers
-- are already denied by customers_no_workers.
DROP POLICY IF EXISTS "sites_all" ON public.sites;
CREATE POLICY "sites_no_workers" ON public.sites
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

-- ── recurring_jobs ──────────────────────────────────────────────────────────
-- Schedule configuration, not the job itself. A worker sees the materialised
-- work orders assigned to them; the recurrence rules are management config.
DROP POLICY IF EXISTS "recurring_jobs_business_access" ON public.recurring_jobs;
CREATE POLICY "recurring_jobs_no_workers" ON public.recurring_jobs
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
