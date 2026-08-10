-- Payment details held on file for a customer, for MANUAL processing.
--
-- The business's Stripe account was closed, so there is no processor to
-- tokenise against. What they need is the boring thing: the bank details
-- written down once, safely, so someone can key the payment into their bank
-- portal instead of asking the client for them again every month.
--
-- 🔴 DELIBERATELY NOT CARDS. There is no kind for a card number and there
-- must never be one. Storing a PAN drags this database, its backups and its
-- logs into PCI-DSS audit scope; storing a CVV after authorisation is
-- prohibited outright at every compliance level. The CHECK below is the
-- enforcement, not a comment — a card kind cannot be inserted without a
-- migration that someone has to justify.
--
-- Modelled on vault_items (20260808 vault migration): same AES-256-GCM via
-- lib/crypto.ts, same owner/admin-only reveal, same access log. A payment
-- detail is a secret with an audit trail, which is exactly what the vault
-- already solved.

CREATE TABLE IF NOT EXISTS public.customer_payment_details (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- CASCADE: deleting a client must not leave their bank details behind with
  -- nothing to say whose they were.
  customer_id   UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,

  -- Constrained, unlike vault_items.category. The whole safety property of
  -- this table is which kinds of number may live in it.
  kind          TEXT NOT NULL DEFAULT 'bank_au',
  CONSTRAINT customer_payment_details_kind_check
    CHECK (kind IN ('bank_au', 'bank_intl', 'payid', 'bpay', 'other')),

  label         TEXT,
  holder_name   TEXT,
  bank_name     TEXT,

  -- The sensitive parts. Account number / IBAN / PayID / BPAY reference, and
  -- the routing value (BSB, sort code, SWIFT). Encrypted rather than stored
  -- plainly for the same reason the vault encrypts a password: a database
  -- dump should not be a list of everyone's bank accounts.
  account_enc   TEXT,
  routing_enc   TEXT,

  -- Masked, plaintext, safe to render in a list: "•••• 4321". Lets the UI
  -- show which account is which without decrypting anything.
  hint          TEXT,

  -- Non-secret free text: "use reference INV number", "pays on the 1st".
  notes         TEXT,

  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.customer_payment_details IS
  'Bank/transfer details held for manual processing. NEVER card numbers or CVV — see the kind CHECK.';
COMMENT ON COLUMN public.customer_payment_details.account_enc IS
  'AES-256-GCM ciphertext (lib/crypto.ts). NEVER store or return plaintext.';
COMMENT ON COLUMN public.customer_payment_details.routing_enc IS
  'AES-256-GCM ciphertext. BSB / sort code / SWIFT.';
COMMENT ON COLUMN public.customer_payment_details.hint IS
  'Masked display value only, e.g. "•••• 4321". Safe to render without decrypting.';

CREATE INDEX IF NOT EXISTS idx_customer_payment_details_business
  ON public.customer_payment_details (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_payment_details_customer
  ON public.customer_payment_details (business_id, customer_id);

-- Who looked at what, and when.
--
-- Same reasoning as vault_access_log: the justification for holding these
-- centrally is being able to answer "who saw this account number". Reveals
-- are logged; the plaintext never is.
CREATE TABLE IF NOT EXISTS public.payment_detail_access_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- SET NULL + a label snapshot, so the trail outlives the row it describes.
  detail_id   UUID REFERENCES public.customer_payment_details(id) ON DELETE SET NULL,
  detail_label TEXT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email  TEXT,
  action      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_detail_log_business
  ON public.payment_detail_access_log (business_id, created_at DESC);

ALTER TABLE public.customer_payment_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_detail_access_log ENABLE ROW LEVEL SECURITY;

-- Owner/admin only, both tables — narrower than the usual member read.
-- Bank details are not something an editor or viewer needs, and workers are
-- excluded from customers entirely.
DROP POLICY IF EXISTS customer_payment_details_rw ON public.customer_payment_details;
CREATE POLICY customer_payment_details_rw ON public.customer_payment_details FOR ALL USING (
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

DROP POLICY IF EXISTS payment_detail_access_log_read ON public.payment_detail_access_log;
CREATE POLICY payment_detail_access_log_read ON public.payment_detail_access_log FOR SELECT USING (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND status='active' AND role = 'admin'
  )
);

-- Append-only from the app's perspective: entries are written by the
-- server action, and nobody gets to edit or delete the trail.
DROP POLICY IF EXISTS payment_detail_access_log_insert ON public.payment_detail_access_log;
CREATE POLICY payment_detail_access_log_insert ON public.payment_detail_access_log FOR INSERT WITH CHECK (
  business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
    UNION SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND status='active' AND role = 'admin'
  )
);
