-- Default terms & conditions per document type, settable from the PDF template
-- editor. New invoices/quotes pre-fill their terms from these (falling back to
-- the legacy payment_terms). Additive.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS default_invoice_terms TEXT,
  ADD COLUMN IF NOT EXISTS default_quote_terms   TEXT;
