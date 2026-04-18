-- ============================================================
-- Phase 1: Account / Site / Contact / Billing model + Job Portfolio tables
-- ============================================================
-- Customers table is treated as the "Account" backing — no rename, just semantic.
-- Adds: sites, contacts, billing_profiles, site_billing,
--       job_timeline_events, job_photos (with phase), job_time_entries,
--       job_materials, job_signatures, job_documents, job_forms, site_assets.
-- Backfills: each existing customer → 1 site + 1 contact + 1 billing profile.

-- Helper: standard RLS predicate
-- business_id IN (
--   SELECT id FROM businesses WHERE user_id = auth.uid()
--   UNION
--   SELECT business_id FROM business_members WHERE user_id = auth.uid() AND status='active'
-- )

-- ============================================================
-- 1. Customers gains "account_type"
-- ============================================================
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'individual'
    CHECK (account_type IN ('individual','property_mgmt','commercial','strata','other'));

-- ============================================================
-- 2. SITES (physical properties owned by an account)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES public.customers(id)  ON DELETE CASCADE,
  label         TEXT,
  address       TEXT,
  city          TEXT,
  postcode      TEXT,
  country       TEXT,
  lat           NUMERIC(10,7),
  lng           NUMERIC(10,7),
  access_notes  TEXT,
  gate_code     TEXT,
  parking_notes TEXT,
  archived      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sites_account_idx  ON public.sites(account_id);
CREATE INDEX IF NOT EXISTS sites_business_idx ON public.sites(business_id);
CREATE TRIGGER sites_updated_at BEFORE UPDATE ON public.sites
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sites_all" ON public.sites FOR ALL
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
-- 3. CONTACTS (people associated with an account)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES public.customers(id)  ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  role        TEXT NOT NULL DEFAULT 'other'
              CHECK (role IN ('owner','pm','tenant','super','primary','accounts','other')),
  notes       TEXT,
  archived    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contacts_account_idx  ON public.contacts(account_id);
CREATE INDEX IF NOT EXISTS contacts_business_idx ON public.contacts(business_id);
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

-- ============================================================
-- 4. SITE_CONTACTS (link contacts to specific sites)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_contacts (
  site_id    UUID NOT NULL REFERENCES public.sites(id)    ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'tenant'
             CHECK (role IN ('tenant','super','owner_onsite','primary','other')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, contact_id)
);
ALTER TABLE public.site_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_contacts_all" ON public.site_contacts FOR ALL
  USING (site_id IN (
    SELECT id FROM public.sites WHERE business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
    )
  ));

-- ============================================================
-- 5. BILLING_PROFILES (who pays — separate from booker/contact)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.billing_profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES public.customers(id)  ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  address        TEXT,
  city           TEXT,
  postcode       TEXT,
  country        TEXT,
  tax_number     TEXT,
  payment_terms  TEXT,
  notes          TEXT,
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  archived       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_profiles_account_idx  ON public.billing_profiles(account_id);
CREATE INDEX IF NOT EXISTS billing_profiles_business_idx ON public.billing_profiles(business_id);
CREATE TRIGGER billing_profiles_updated_at BEFORE UPDATE ON public.billing_profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.billing_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_profiles_all" ON public.billing_profiles FOR ALL
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
-- 6. SITE_BILLING (link a site to its default billing profile)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_billing (
  site_id            UUID PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  billing_profile_id UUID NOT NULL REFERENCES public.billing_profiles(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.site_billing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_billing_all" ON public.site_billing FOR ALL
  USING (site_id IN (
    SELECT id FROM public.sites WHERE business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
    )
  ));

-- ============================================================
-- 7. SITE_ASSETS (equipment register per site)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  site_id         UUID NOT NULL REFERENCES public.sites(id)      ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT,
  make            TEXT,
  model           TEXT,
  serial_number   TEXT,
  install_date    DATE,
  warranty_expiry DATE,
  last_serviced   DATE,
  notes           TEXT,
  photos          JSONB NOT NULL DEFAULT '[]',
  archived        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS site_assets_site_idx ON public.site_assets(site_id);
CREATE TRIGGER site_assets_updated_at BEFORE UPDATE ON public.site_assets
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.site_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_assets_all" ON public.site_assets FOR ALL
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
-- 8. WORK_ORDERS gains site / role columns
-- ============================================================
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS site_id              UUID REFERENCES public.sites(id)            ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booker_contact_id    UUID REFERENCES public.contacts(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onsite_contact_id    UUID REFERENCES public.contacts(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_profile_id   UUID REFERENCES public.billing_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cc_contact_ids       UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reported_issue       TEXT,
  ADD COLUMN IF NOT EXISTS started_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at         TIMESTAMPTZ;

-- Same for invoices and quotes — link to billing_profile + site for property-mgmt flow
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS site_id            UUID REFERENCES public.sites(id)            ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_profile_id UUID REFERENCES public.billing_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_order_id      UUID REFERENCES public.work_orders(id)      ON DELETE SET NULL;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS site_id            UUID REFERENCES public.sites(id)            ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_profile_id UUID REFERENCES public.billing_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_order_id      UUID REFERENCES public.work_orders(id)      ON DELETE SET NULL;

-- ============================================================
-- 9. JOB_TIMELINE_EVENTS (the unified feed)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_timeline_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id)  ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  -- e.g. status_change | photo_added | note_added | message_sent | message_received
  --      quote_sent | quote_viewed | quote_accepted | invoice_sent | invoice_paid
  --      time_started | time_ended | material_added | signature_captured
  --      arrived | departed | scope_change | form_completed
  actor_type    TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('user','system','customer')),
  actor_id      UUID,
  actor_label   TEXT,
  payload       JSONB NOT NULL DEFAULT '{}',
  visible_to_customer BOOLEAN NOT NULL DEFAULT FALSE,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS jte_work_order_idx ON public.job_timeline_events(work_order_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS jte_business_idx   ON public.job_timeline_events(business_id);

ALTER TABLE public.job_timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jte_all" ON public.job_timeline_events FOR ALL
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
-- 10. JOB_PHOTOS (replaces JSONB array — first-class table)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id)  ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  phase         TEXT NOT NULL DEFAULT 'during'
                CHECK (phase IN ('before','during','after','reference')),
  caption       TEXT,
  lat           NUMERIC(10,7),
  lng           NUMERIC(10,7),
  taken_by      UUID REFERENCES auth.users(id),
  taken_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  annotations   JSONB NOT NULL DEFAULT '[]',
  customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS job_photos_wo_idx ON public.job_photos(work_order_id, taken_at);

ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_photos_all" ON public.job_photos FOR ALL
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
-- 11. JOB_TIME_ENTRIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_time_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID NOT NULL REFERENCES public.businesses(id)  ON DELETE CASCADE,
  work_order_id      UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  member_profile_id  UUID REFERENCES public.member_profiles(id) ON DELETE SET NULL,
  user_id            UUID REFERENCES auth.users(id),
  type               TEXT NOT NULL DEFAULT 'work' CHECK (type IN ('work','travel','break')),
  started_at         TIMESTAMPTZ NOT NULL,
  ended_at           TIMESTAMPTZ,
  duration_seconds   INTEGER,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS jte_time_wo_idx ON public.job_time_entries(work_order_id);

ALTER TABLE public.job_time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jte_time_all" ON public.job_time_entries FOR ALL
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
-- 12. JOB_MATERIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_materials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id)  ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  qty           NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit          TEXT,
  unit_cost     NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  added_by      UUID REFERENCES auth.users(id),
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  billable      BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS job_materials_wo_idx ON public.job_materials(work_order_id);

ALTER TABLE public.job_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_materials_all" ON public.job_materials FOR ALL
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
-- 13. JOB_SIGNATURES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_signatures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES public.businesses(id)  ON DELETE CASCADE,
  work_order_id   UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  signed_by_name  TEXT NOT NULL,
  signed_by_role  TEXT,
  signature_url   TEXT NOT NULL,
  purpose         TEXT NOT NULL DEFAULT 'completion'
                  CHECK (purpose IN ('quote','completion','change_order','safety','other')),
  signed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip              TEXT,
  user_agent      TEXT
);
CREATE INDEX IF NOT EXISTS job_signatures_wo_idx ON public.job_signatures(work_order_id);

ALTER TABLE public.job_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_signatures_all" ON public.job_signatures FOR ALL
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
-- 14. JOB_DOCUMENTS (attachments other than photos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id)  ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT,
  category      TEXT DEFAULT 'other'
                CHECK (category IN ('permit','warranty','certificate','insurance','manual','contract','other')),
  uploaded_by   UUID REFERENCES auth.users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_visible BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS job_documents_wo_idx ON public.job_documents(work_order_id);

ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_documents_all" ON public.job_documents FOR ALL
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
-- 15. JOB_FORMS (completed checklists / inspection forms)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_form_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  schema      JSONB NOT NULL DEFAULT '[]',
  archived    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.job_form_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_form_templates_all" ON public.job_form_templates FOR ALL
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

CREATE TABLE IF NOT EXISTS public.job_forms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id)  ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  template_id   UUID REFERENCES public.job_form_templates(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  responses     JSONB NOT NULL DEFAULT '{}',
  completed_by  UUID REFERENCES auth.users(id),
  completed_at  TIMESTAMPTZ,
  signature_url TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS job_forms_wo_idx ON public.job_forms(work_order_id);

ALTER TABLE public.job_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_forms_all" ON public.job_forms FOR ALL
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
-- 16. SITE_ASSET_JOBS (link asset → job for service history)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_asset_jobs (
  asset_id      UUID NOT NULL REFERENCES public.site_assets(id)  ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  action        TEXT DEFAULT 'serviced'
                CHECK (action IN ('inspected','serviced','repaired','replaced','installed','removed')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (asset_id, work_order_id)
);
ALTER TABLE public.site_asset_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_asset_jobs_all" ON public.site_asset_jobs FOR ALL
  USING (asset_id IN (
    SELECT id FROM public.site_assets WHERE business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
    )
  ));

-- ============================================================
-- 17. JOB SHARE TOKENS (customer-facing report links)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_share_tokens (
  token         TEXT PRIMARY KEY,
  business_id   UUID NOT NULL REFERENCES public.businesses(id)  ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ,
  revoked       BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS job_share_tokens_wo_idx ON public.job_share_tokens(work_order_id);

ALTER TABLE public.job_share_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_share_tokens_all" ON public.job_share_tokens FOR ALL
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
-- 18. BACKFILL — every existing customer becomes a full account
-- ============================================================

-- 18a-pre. Migrate existing customer_properties → sites
INSERT INTO public.sites (business_id, account_id, label, address, city, postcode, country, created_at, updated_at)
SELECT cp.business_id, cp.customer_id, cp.label, cp.address, cp.city, cp.postcode, cp.country, cp.created_at, cp.updated_at
FROM public.customer_properties cp
ON CONFLICT DO NOTHING;

-- 18a. Default site per customer (only if customer has no sites yet — covers customers with no customer_properties row)
INSERT INTO public.sites (business_id, account_id, label, address, city, postcode, country)
SELECT c.business_id, c.id, 'Primary site', c.address, c.city, c.postcode, c.country
FROM public.customers c
WHERE NOT EXISTS (SELECT 1 FROM public.sites s WHERE s.account_id = c.id);

-- 18b-pre. Migrate existing customer_contacts → contacts
INSERT INTO public.contacts (business_id, account_id, name, email, phone, role, notes, created_at)
SELECT cc.business_id, cc.customer_id, cc.name, cc.email, cc.phone,
       CASE WHEN cc.is_primary THEN 'primary' ELSE COALESCE(NULLIF(cc.role,''), 'other') END,
       cc.notes, cc.created_at
FROM public.customer_contacts cc
ON CONFLICT DO NOTHING;

-- 18b. Default contact per customer (only if customer has no contacts yet)
INSERT INTO public.contacts (business_id, account_id, name, email, phone, role)
SELECT c.business_id, c.id, c.name, c.email, c.phone, 'primary'
FROM public.customers c
WHERE NOT EXISTS (SELECT 1 FROM public.contacts ct WHERE ct.account_id = c.id);

-- 18c. Default billing profile per customer
INSERT INTO public.billing_profiles (business_id, account_id, name, email, phone, address, city, postcode, country, tax_number, is_default)
SELECT c.business_id, c.id, COALESCE(c.company, c.name), c.email, c.phone,
       c.address, c.city, c.postcode, c.country, c.tax_number, TRUE
FROM public.customers c
WHERE NOT EXISTS (SELECT 1 FROM public.billing_profiles bp WHERE bp.account_id = c.id AND bp.is_default = TRUE);

-- 18d. Link each backfilled site to its default billing profile
INSERT INTO public.site_billing (site_id, billing_profile_id)
SELECT s.id, bp.id
FROM public.sites s
JOIN public.billing_profiles bp
  ON bp.account_id = s.account_id AND bp.is_default = TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.site_billing sb WHERE sb.site_id = s.id);

-- 18e. Link existing work_orders to site / billing_profile
UPDATE public.work_orders wo
SET site_id = (SELECT s.id FROM public.sites s WHERE s.account_id = wo.customer_id ORDER BY s.created_at LIMIT 1)
WHERE wo.customer_id IS NOT NULL AND wo.site_id IS NULL;

UPDATE public.work_orders wo
SET billing_profile_id = (
  SELECT bp.id FROM public.billing_profiles bp
  WHERE bp.account_id = wo.customer_id AND bp.is_default = TRUE LIMIT 1
)
WHERE wo.customer_id IS NOT NULL AND wo.billing_profile_id IS NULL;

UPDATE public.work_orders wo
SET booker_contact_id = (
  SELECT ct.id FROM public.contacts ct
  WHERE ct.account_id = wo.customer_id ORDER BY ct.created_at LIMIT 1
)
WHERE wo.customer_id IS NOT NULL AND wo.booker_contact_id IS NULL;

-- 18f. Link existing invoices / quotes to site + billing profile
UPDATE public.invoices i
SET site_id = (SELECT s.id FROM public.sites s WHERE s.account_id = i.customer_id ORDER BY s.created_at LIMIT 1),
    billing_profile_id = (
      SELECT bp.id FROM public.billing_profiles bp
      WHERE bp.account_id = i.customer_id AND bp.is_default = TRUE LIMIT 1
    )
WHERE i.customer_id IS NOT NULL AND i.site_id IS NULL;

UPDATE public.quotes q
SET site_id = (SELECT s.id FROM public.sites s WHERE s.account_id = q.customer_id ORDER BY s.created_at LIMIT 1),
    billing_profile_id = (
      SELECT bp.id FROM public.billing_profiles bp
      WHERE bp.account_id = q.customer_id AND bp.is_default = TRUE LIMIT 1
    )
WHERE q.customer_id IS NOT NULL AND q.site_id IS NULL;

-- 18g. Backfill timeline events from existing work_orders.photos JSONB
INSERT INTO public.job_photos (business_id, work_order_id, url, phase, taken_at)
SELECT wo.business_id, wo.id, p.value->>'url', 'during', wo.created_at
FROM public.work_orders wo, jsonb_array_elements(wo.photos) AS p
WHERE p.value->>'url' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.job_photos jp WHERE jp.work_order_id = wo.id AND jp.url = p.value->>'url'
  );

-- 18h. Seed a "created" timeline event for each existing work_order
INSERT INTO public.job_timeline_events (business_id, work_order_id, type, actor_type, actor_id, payload, occurred_at)
SELECT wo.business_id, wo.id, 'created', 'user', wo.user_id,
       jsonb_build_object('status', wo.status, 'title', wo.title),
       wo.created_at
FROM public.work_orders wo
WHERE NOT EXISTS (
  SELECT 1 FROM public.job_timeline_events e WHERE e.work_order_id = wo.id AND e.type = 'created'
);

-- ============================================================
-- 19. DROP OBSOLETE TABLES (replaced by sites/contacts)
-- ============================================================
DROP TABLE IF EXISTS public.customer_properties CASCADE;
DROP TABLE IF EXISTS public.customer_contacts   CASCADE;
-- customer_notes kept for now — folded into account activity feed in a later phase.
