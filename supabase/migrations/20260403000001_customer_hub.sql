CREATE TABLE IF NOT EXISTS customer_properties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label       text,
  address     text NOT NULL,
  city        text,
  postcode    text,
  country     text,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  role        text,
  email       text,
  phone       text,
  is_primary  boolean DEFAULT false,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  content     text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE customer_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notes      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "business members access customer_properties" ON customer_properties FOR ALL
    USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid() UNION SELECT business_id FROM business_members WHERE user_id = auth.uid() AND status = 'active'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "business members access customer_contacts" ON customer_contacts FOR ALL
    USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid() UNION SELECT business_id FROM business_members WHERE user_id = auth.uid() AND status = 'active'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "business members access customer_notes" ON customer_notes FOR ALL
    USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid() UNION SELECT business_id FROM business_members WHERE user_id = auth.uid() AND status = 'active'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
