-- SMS conversations and messages for two-way texting with customers

CREATE TABLE IF NOT EXISTS sms_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name   TEXT NOT NULL,          -- snapshot in case customer is deleted
  customer_phone  TEXT NOT NULL,          -- E.164 format, e.g. +61412345678
  unread_count    INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, customer_phone)
);

CREATE TABLE IF NOT EXISTS sms_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES sms_conversations(id) ON DELETE CASCADE,
  business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  direction        TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  body             TEXT NOT NULL,
  from_number      TEXT NOT NULL,
  to_number        TEXT NOT NULL,
  twilio_sid       TEXT,
  status           TEXT NOT NULL DEFAULT 'sent',  -- sent, delivered, failed, received
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_sms_conv_business ON sms_conversations(business_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_msg_conv ON sms_messages(conversation_id, created_at ASC);

-- Store the Twilio number per business in the businesses table
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS twilio_phone TEXT;

-- Enable realtime for messages so the UI updates without polling
ALTER PUBLICATION supabase_realtime ADD TABLE sms_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE sms_conversations;
