-- Allow multiple businesses per user account

-- 1. Drop unique constraint on businesses so one user can own many
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_user_id_key;

-- 2. Add business_id column to all data tables
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.products  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.invoices  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.quotes    ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.payments  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.reports   ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;

-- 3. Backfill existing rows from user→business relationship
UPDATE public.customers  c  SET business_id = b.id FROM public.businesses b WHERE b.user_id = c.user_id  AND c.business_id IS NULL;
UPDATE public.products   p  SET business_id = b.id FROM public.businesses b WHERE b.user_id = p.user_id  AND p.business_id IS NULL;
UPDATE public.invoices   i  SET business_id = b.id FROM public.businesses b WHERE b.user_id = i.user_id  AND i.business_id IS NULL;
UPDATE public.quotes     q  SET business_id = b.id FROM public.businesses b WHERE b.user_id = q.user_id  AND q.business_id IS NULL;
UPDATE public.payments   py SET business_id = b.id FROM public.businesses b WHERE b.user_id = py.user_id AND py.business_id IS NULL;
UPDATE public.reports    r  SET business_id = b.id FROM public.businesses b WHERE b.user_id = r.user_id  AND r.business_id IS NULL;

-- 4. Enforce NOT NULL after backfill
ALTER TABLE public.customers ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.products  ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.invoices  ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.quotes    ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.payments  ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.reports   ALTER COLUMN business_id SET NOT NULL;

-- 5. Drop old user_id-based RLS policies on data tables
DROP POLICY IF EXISTS "Users can view own customers"   ON public.customers;
DROP POLICY IF EXISTS "Users can insert own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can update own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can delete own customers" ON public.customers;

DROP POLICY IF EXISTS "Users can view own products"   ON public.products;
DROP POLICY IF EXISTS "Users can insert own products" ON public.products;
DROP POLICY IF EXISTS "Users can update own products" ON public.products;
DROP POLICY IF EXISTS "Users can delete own products" ON public.products;

DROP POLICY IF EXISTS "Users can view own invoices"   ON public.invoices;
DROP POLICY IF EXISTS "Users can insert own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can update own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can delete own invoices" ON public.invoices;

DROP POLICY IF EXISTS "Users can view own quotes"   ON public.quotes;
DROP POLICY IF EXISTS "Users can insert own quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can update own quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can delete own quotes" ON public.quotes;

DROP POLICY IF EXISTS "Users can view own payments"   ON public.payments;
DROP POLICY IF EXISTS "Users can insert own payments" ON public.payments;
DROP POLICY IF EXISTS "Users can delete own payments" ON public.payments;

DROP POLICY IF EXISTS "Users can manage own reports" ON public.reports;

-- 6. New business-scoped RLS policies (one FOR ALL policy per table)
CREATE POLICY "Business members can manage customers" ON public.customers
  FOR ALL
  USING  (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

CREATE POLICY "Business members can manage products" ON public.products
  FOR ALL
  USING  (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

CREATE POLICY "Business members can manage invoices" ON public.invoices
  FOR ALL
  USING  (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

CREATE POLICY "Business members can manage quotes" ON public.quotes
  FOR ALL
  USING  (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

CREATE POLICY "Business members can manage payments" ON public.payments
  FOR ALL
  USING  (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

CREATE POLICY "Business members can manage reports" ON public.reports
  FOR ALL
  USING  (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
