-- Telegram roof report sessions
-- Tracks in-progress report generation initiated from the Telegram bot

CREATE TABLE IF NOT EXISTS report_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  chat_id         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'collecting'
                    CHECK (status IN ('collecting', 'generating', 'done', 'failed')),
  property_address TEXT,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  photo_file_ids  TEXT[] NOT NULL DEFAULT '{}',
  report_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_sessions_chat ON report_sessions(chat_id, status);

-- Supabase storage bucket for generated reports
-- (create the bucket via dashboard or this will just note it's needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('roof-reports', 'roof-reports', true)
-- ON CONFLICT DO NOTHING;
