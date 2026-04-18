-- Tracks agent actions on specific resources to prevent duplicate sends
CREATE TABLE IF NOT EXISTS agent_run_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  agent_id      text        NOT NULL,
  resource_type text,                   -- 'invoice' | 'quote' | 'work_order' | null
  resource_id   uuid,                   -- ID of the resource acted on
  ran_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_run_logs_lookup
  ON agent_run_logs (business_id, agent_id, resource_type, resource_id, ran_at);

ALTER TABLE agent_run_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_run_logs_business_access" ON agent_run_logs
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM business_members
        WHERE user_id = auth.uid() AND status = 'active'
    )
  );
