-- Password vault: the account logins an agency holds on its clients' behalf.
--
-- Every secret column is AES-256-GCM ciphertext (src/lib/crypto.ts,
-- APP_ENCRYPTION_KEY). Nothing here is ever written in the clear — the app
-- refuses to save when no encryption key is configured rather than falling
-- back to plaintext, which is the failure mode that actually leaks.
--
-- What the ciphertext protects against: a database dump, a leaked backup, a
-- read-only SQL compromise. What it does NOT protect against: someone holding
-- both the server env var and the database. That is a deliberate trade for
-- recoverability — a zero-knowledge passphrase would make a forgotten
-- passphrase mean permanent loss of every client credential.

CREATE TABLE IF NOT EXISTS public.vault_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- Optional: an entry can belong to a client, or be the business's own
  -- (its Meta Business account, a shared tool login).
  -- CASCADE, not SET NULL: deleting a client should not leave their
  -- credentials sitting in the table with nothing to say whose they were.
  customer_id   UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  -- Free text, not an enum: a new kind of account shouldn't need a migration.
  category      TEXT NOT NULL DEFAULT 'other',
  -- Plaintext on purpose. You search by username and it is not the secret —
  -- encrypting it would mean decrypting every row to run a search.
  username      TEXT,
  url           TEXT,
  password_enc  TEXT,
  -- Recovery codes, security answers, PINs — as sensitive as the password,
  -- so encrypted the same way rather than dropped in a notes column.
  notes_enc     TEXT,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.vault_items.password_enc IS
  'AES-256-GCM ciphertext (lib/crypto.ts). NEVER store or return plaintext.';
COMMENT ON COLUMN public.vault_items.notes_enc IS
  'AES-256-GCM ciphertext. Recovery codes / security answers.';

CREATE INDEX IF NOT EXISTS idx_vault_items_business
  ON public.vault_items (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_items_customer
  ON public.vault_items (business_id, customer_id);

-- Who looked at what, and when.
--
-- A vault without this is unauditable: the whole point of putting shared
-- credentials in one place is being able to answer "who had the Meta password
-- before it was misused". Reveals are logged; the plaintext never is.
CREATE TABLE IF NOT EXISTS public.vault_access_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- SET NULL + a title snapshot, so the trail survives the item being
  -- deleted. An audit log that disappears when someone removes the evidence
  -- is not an audit log.
  item_id     UUID REFERENCES public.vault_items(id) ON DELETE SET NULL,
  item_title  TEXT,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email  TEXT,
  action      TEXT NOT NULL CHECK (action IN ('reveal','create','update','delete')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_log_business
  ON public.vault_access_log (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_log_item
  ON public.vault_access_log (item_id, created_at DESC);

ALTER TABLE public.vault_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_access_log ENABLE ROW LEVEL SECURITY;

-- Read: owner + admin ONLY. Deliberately tighter than every other table in
-- this app, which lets any non-worker member read. Editors and viewers have
-- no business reading the ciphertext or knowing which accounts exist, and
-- workers are excluded by not being in the list at all.
--
-- Write is the same set: there is no useful "can add but not read" role for a
-- credential store.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['vault_items','vault_access_log'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS %1$s_admin_read ON public.%1$s;
      CREATE POLICY %1$s_admin_read ON public.%1$s FOR SELECT USING (
        business_id IN (
          SELECT id FROM public.businesses WHERE user_id = auth.uid()
          UNION SELECT business_id FROM public.business_members
            WHERE user_id = auth.uid() AND status='active' AND role = 'admin'
        )
      );
      DROP POLICY IF EXISTS %1$s_admin_write ON public.%1$s;
      CREATE POLICY %1$s_admin_write ON public.%1$s FOR ALL USING (
        business_id IN (
          SELECT id FROM public.businesses WHERE user_id = auth.uid()
          UNION SELECT business_id FROM public.business_members
            WHERE user_id = auth.uid() AND status='active' AND role = 'admin'
        )
      ) WITH CHECK (
        business_id IN (
          SELECT id FROM public.businesses WHERE user_id = auth.uid()
          UNION SELECT business_id FROM public.business_members
            WHERE user_id = auth.uid() AND status='active' AND role = 'admin'
        )
      );
    $f$, t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS vault_items_updated_at ON public.vault_items;
CREATE TRIGGER vault_items_updated_at BEFORE UPDATE ON public.vault_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Per-business on/off, matching how every other plugin stores its flag.
CREATE TABLE IF NOT EXISTS public.vault_settings (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.vault_settings ENABLE ROW LEVEL SECURITY;

-- The FLAG is readable by any non-worker member (the nav needs to know
-- whether to show the tab); the CONTENTS are not. Only owner/admin can flip it.
DROP POLICY IF EXISTS vault_settings_read ON public.vault_settings;
CREATE POLICY vault_settings_read ON public.vault_settings FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND status='active'
  )
);
DROP POLICY IF EXISTS vault_settings_write ON public.vault_settings;
CREATE POLICY vault_settings_write ON public.vault_settings FOR ALL USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND status='active' AND role = 'admin'
  )
) WITH CHECK (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND status='active' AND role = 'admin'
  )
);

DROP TRIGGER IF EXISTS vault_settings_updated_at ON public.vault_settings;
CREATE TRIGGER vault_settings_updated_at BEFORE UPDATE ON public.vault_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
