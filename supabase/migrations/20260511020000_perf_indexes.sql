-- ============================================================================
-- Performance indexes for hot multi-tenant query paths.
--
-- Every list query in the app filters by `business_id` (RLS does too), and
-- detail pages join on `customer_id` / `parent_invoice_id` etc. Without
-- explicit indexes these were seq scans — fine on dev, painful at scale.
--
-- All CREATE INDEX statements use IF NOT EXISTS so this migration is safe
-- to re-run.
-- ============================================================================

-- Invoices: every list view orders by created_at DESC scoped to business
CREATE INDEX IF NOT EXISTS idx_invoices_business_created
  ON public.invoices (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_customer
  ON public.invoices (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON public.invoices (business_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due
  ON public.invoices (business_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_work_order
  ON public.invoices (work_order_id) WHERE work_order_id IS NOT NULL;

-- Payments: every payment lookup is by invoice_id; reconciliation also
-- scopes to business_id
CREATE INDEX IF NOT EXISTS idx_payments_invoice
  ON public.payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_business
  ON public.payments (business_id, created_at DESC);

-- Customers: list view filters archived=false; lookup by email/phone for
-- lead conversion + duplicate detection
CREATE INDEX IF NOT EXISTS idx_customers_business_archived
  ON public.customers (business_id, archived);
CREATE INDEX IF NOT EXISTS idx_customers_business_name
  ON public.customers (business_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_customers_business_email
  ON public.customers (business_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_business_phone
  ON public.customers (business_id, phone) WHERE phone IS NOT NULL;

-- Quotes: list view + filter by status
CREATE INDEX IF NOT EXISTS idx_quotes_business_created
  ON public.quotes (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_customer
  ON public.quotes (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_status
  ON public.quotes (business_id, status);
CREATE INDEX IF NOT EXISTS idx_quotes_work_order
  ON public.quotes (work_order_id) WHERE work_order_id IS NOT NULL;

-- Work orders: list view, today's schedule, customer drill-in
CREATE INDEX IF NOT EXISTS idx_work_orders_business_created
  ON public.work_orders (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_orders_business_scheduled
  ON public.work_orders (business_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_work_orders_customer
  ON public.work_orders (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_status
  ON public.work_orders (business_id, status);

-- Leads: list view + status filter + lookup by email/phone for dedup
CREATE INDEX IF NOT EXISTS idx_leads_business_created
  ON public.leads (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_business_status
  ON public.leads (business_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_business_email
  ON public.leads (business_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_business_phone
  ON public.leads (business_id, phone) WHERE phone IS NOT NULL;

-- Tasks (kanban) — every fetch is by business + status
CREATE INDEX IF NOT EXISTS idx_tasks_business_status
  ON public.tasks (business_id, status, created_at DESC);

-- Products catalog
CREATE INDEX IF NOT EXISTS idx_products_business_archived
  ON public.products (business_id, archived);

-- Reports
CREATE INDEX IF NOT EXISTS idx_reports_business_created
  ON public.reports (business_id, created_at DESC);

-- Work order assignments — every job-detail page joins on this
CREATE INDEX IF NOT EXISTS idx_wo_assignments_work_order
  ON public.work_order_assignments (work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_assignments_profile
  ON public.work_order_assignments (member_profile_id);

-- Business members — every dashboard load hits this
CREATE INDEX IF NOT EXISTS idx_business_members_user
  ON public.business_members (user_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_business_members_business
  ON public.business_members (business_id, status);
