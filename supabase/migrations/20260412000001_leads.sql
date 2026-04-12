-- Leads table — tracks prospective customers before they become clients
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Contact info
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  suburb TEXT,
  address TEXT,

  -- Lead details
  service TEXT,
  property_type TEXT,
  timing TEXT,
  notes TEXT,

  -- Pipeline stage
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'lost')),

  -- Source tracking
  source TEXT DEFAULT 'manual'
    CHECK (source IN ('landing-page', 'website', 'referral', 'telegram', 'email', 'phone', 'manual')),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,

  -- Links to other records (when lead progresses)
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_business_access" ON leads
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM business_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_leads_updated_at();

-- Index for common queries
CREATE INDEX leads_business_id_idx ON leads(business_id);
CREATE INDEX leads_status_idx ON leads(status);
CREATE INDEX leads_created_at_idx ON leads(created_at DESC);
