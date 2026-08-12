-- Nine contacts created by quoting a lead were all labelled 'client'.
--
-- The lead-lifecycle migration's design was "a lead gets a real contact row
-- the moment you first quote them, and that row is marked as still being a
-- lead". The marking was never wired: `customers.lifecycle_stage` was added to
-- the database and to the TypeScript `Contact` type, but NOT to `Customer` —
-- so no code could set it, TypeScript couldn't flag its absence, and every row
-- silently took the 'client' default. 9 of 9 in production were wrong, and the
-- Lead tag the column exists to drive could never appear anywhere.
--
-- Only rows a lead actually points at are touched. A contact somebody typed in
-- by hand is a client and stays one.
UPDATE public.customers c
SET lifecycle_stage = 'lead'
WHERE c.lifecycle_stage = 'client'
  AND EXISTS (SELECT 1 FROM public.leads l WHERE l.customer_id = c.id)
  -- Someone who has paid you is not a lead any more, whatever they started as.
  AND NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.customer_id = c.id AND i.status IN ('paid', 'partial')
  );
