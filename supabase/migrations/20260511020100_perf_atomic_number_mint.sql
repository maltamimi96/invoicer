-- ============================================================================
-- Atomic next_*_number RPCs.
--
-- Previously, creating an invoice/quote/work-order did:
--   SELECT prefix, next_number FROM businesses ...
--   ... format the string ...
--   UPDATE businesses SET next_number = next_number + 1 ...
--
-- Two round-trips per create, AND a race condition under concurrency
-- (two simultaneous creates can mint the same number). These RPCs do the
-- whole thing in one statement, atomically.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_business_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_num    INT;
BEGIN
  -- Check membership / ownership (RLS isn't on businesses for SECURITY DEFINER)
  IF NOT EXISTS (
    SELECT 1 FROM businesses WHERE id = p_business_id AND user_id = auth.uid()
    UNION
    SELECT 1 FROM business_members
     WHERE business_id = p_business_id
       AND user_id = auth.uid()
       AND status = 'active'
       AND role IN ('admin', 'editor')
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE businesses
     SET invoice_next_number = COALESCE(invoice_next_number, 1) + 1
   WHERE id = p_business_id
   RETURNING invoice_prefix,
             COALESCE(invoice_next_number, 1) - 1
   INTO v_prefix, v_num;

  RETURN COALESCE(v_prefix, 'INV') || '-' || LPAD(v_num::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_quote_number(p_business_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_num    INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM businesses WHERE id = p_business_id AND user_id = auth.uid()
    UNION
    SELECT 1 FROM business_members
     WHERE business_id = p_business_id
       AND user_id = auth.uid()
       AND status = 'active'
       AND role IN ('admin', 'editor')
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE businesses
     SET quote_next_number = COALESCE(quote_next_number, 1) + 1
   WHERE id = p_business_id
   RETURNING quote_prefix,
             COALESCE(quote_next_number, 1) - 1
   INTO v_prefix, v_num;

  RETURN COALESCE(v_prefix, 'QT') || '-' || LPAD(v_num::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_invoice_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_quote_number(UUID) TO authenticated;
