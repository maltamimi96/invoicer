-- Unified CRM contacts.
--
-- Step 1: rename the existing per-account `contacts` table to `account_contacts`
--         (its real job — people attached to a customer account: PMs, tenants, etc).
-- Step 2: create a new top-level `contacts` table for the CRM lifecycle:
--         lead -> contact -> customer.
--
-- Existing FKs that pointed at the old `contacts(id)` get re-pointed to
-- `account_contacts(id)` automatically because Postgres preserves the FK
-- through a table rename, but the FK column names already mention "contact"
-- so we leave them as-is for now. (work_orders.booker_contact_id, site_contacts.contact_id)

-- ============================================================
-- 1. RENAME existing contacts -> account_contacts
-- ============================================================
ALTER TABLE public.contacts RENAME TO account_contacts;

ALTER INDEX IF EXISTS contacts_account_idx  RENAME TO account_contacts_account_idx;
ALTER INDEX IF EXISTS contacts_business_idx RENAME TO account_contacts_business_idx;

ALTER TRIGGER contacts_updated_at ON public.account_contacts RENAME TO account_contacts_updated_at;

DROP POLICY IF EXISTS "contacts_all" ON public.account_contacts;
CREATE POLICY "account_contacts_all" ON public.account_contacts FOR ALL
  USING (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ));

-- ============================================================
-- 2. NEW unified contacts table for the CRM lifecycle
-- ============================================================
CREATE TABLE public.contacts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  email           TEXT,
  phone           TEXT,
  company         TEXT,
  notes           TEXT,
  -- lifecycle: 'lead' (just imported), 'contact' (working with), 'customer' (promoted, has customer_id)
  lifecycle_stage TEXT        NOT NULL DEFAULT 'contact'
                              CHECK (lifecycle_stage IN ('lead','contact','customer')),
  -- where this contact came from / was promoted to
  source_lead_id  UUID        REFERENCES public.leads(id)     ON DELETE SET NULL,
  customer_id     UUID        REFERENCES public.customers(id) ON DELETE SET NULL,
  -- simple tag bag — opportunities/pipelines/custom-fields land in later migrations
  tags            TEXT[]      NOT NULL DEFAULT '{}',
  archived        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX contacts_business_idx       ON public.contacts (business_id) WHERE NOT archived;
CREATE INDEX contacts_lifecycle_idx      ON public.contacts (business_id, lifecycle_stage) WHERE NOT archived;
CREATE INDEX contacts_source_lead_idx    ON public.contacts (source_lead_id) WHERE source_lead_id IS NOT NULL;
CREATE INDEX contacts_customer_id_idx    ON public.contacts (customer_id)    WHERE customer_id    IS NOT NULL;
CREATE UNIQUE INDEX contacts_one_per_lead     ON public.contacts (source_lead_id) WHERE source_lead_id IS NOT NULL;
CREATE UNIQUE INDEX contacts_one_per_customer ON public.contacts (customer_id)    WHERE customer_id    IS NOT NULL;

CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_all" ON public.contacts FOR ALL
  USING (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  ));
