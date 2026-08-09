-- Leads and clients are the same people at different stages.
--
-- A lead can already hold forms and appointments (both tables carry a
-- lead_id), but not quotes or invoices — those reference customers only, and
-- so does every path behind them: the PDF, the email, the portal token, the
-- Stripe customer, deposits, autopay, dunning. Giving documents a lead_id
-- would mean a second branch in every one of those, and the likely result is
-- being able to quote a lead but not take their deposit.
--
-- Instead a lead gets a real contact row the moment you first quote them, and
-- that row is marked as still being a lead. Documents keep pointing at
-- customers exactly as they do now; nothing downstream changes.
--
-- lifecycle_stage is what keeps the Clients list honest: a quoted lead has a
-- contact row but is NOT a client, and does not appear there, until money
-- actually arrives.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT NOT NULL DEFAULT 'client'
    CHECK (lifecycle_stage IN ('lead','client'));

COMMENT ON COLUMN public.customers.lifecycle_stage IS
  'lead = has a contact row (quoted) but has never paid; client = has paid. '
  'Set to client automatically on first payment.';

-- Every customer that exists today predates this and is a real client:
-- defaulting them to 'client' is what keeps the Clients list unchanged.

-- The Clients list filters on this, so it is on the hot path.
CREATE INDEX IF NOT EXISTS idx_customers_lifecycle
  ON public.customers (business_id, lifecycle_stage);

-- Which contact row a lead was promoted into. The column already exists and
-- was only set on an explicit convert; it is now set on first document too,
-- so the two can never drift into separate records for one person.
COMMENT ON COLUMN public.leads.customer_id IS
  'The contact row for this lead. Created on first quote/invoice, not only on '
  'an explicit convert — one person, one contact row.';
