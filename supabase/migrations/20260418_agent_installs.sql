-- Agent installs: tracks which agents each business has enabled
CREATE TABLE IF NOT EXISTS business_agent_installs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  agent_id     text        NOT NULL,
  enabled      boolean     NOT NULL DEFAULT true,
  config       jsonb       NOT NULL DEFAULT '{}',
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, agent_id)
);

ALTER TABLE business_agent_installs ENABLE ROW LEVEL SECURITY;

-- Owners and active members of the business can read/write their own installs
CREATE POLICY "agents_business_access" ON business_agent_installs
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM business_members
        WHERE user_id = auth.uid() AND status = 'active'
    )
  );
