-- Add time slots to work_orders
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME;

-- Multiple worker assignments per job
CREATE TABLE IF NOT EXISTS work_order_assignments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id      UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  member_profile_id  UUID NOT NULL REFERENCES member_profiles(id) ON DELETE CASCADE,
  assigned_by        UUID REFERENCES auth.users(id),
  reminder_sent_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(work_order_id, member_profile_id)
);

ALTER TABLE work_order_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignments_business_access" ON work_order_assignments
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
      UNION
      SELECT business_id FROM business_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE INDEX work_order_assignments_work_order_idx ON work_order_assignments(work_order_id);
CREATE INDEX work_order_assignments_profile_idx    ON work_order_assignments(member_profile_id);
CREATE INDEX work_orders_scheduled_date_idx        ON work_orders(scheduled_date) WHERE scheduled_date IS NOT NULL;
