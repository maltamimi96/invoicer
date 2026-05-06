-- Optional licence/registration number for the business itself.
-- Surfaced in PDF headers (reports, invoices, quotes) so trades can
-- show their licence to clients on every document.
alter table public.businesses
  add column if not exists license_number text;
