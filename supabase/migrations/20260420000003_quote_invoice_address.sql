-- Add site_id + property_address to quotes and invoices so the document
-- can target a specific site (or a one-off custom address) instead of
-- always falling back to the customer's primary address.

alter table public.quotes
  add column if not exists site_id uuid references public.sites(id) on delete set null,
  add column if not exists property_address text;

alter table public.invoices
  add column if not exists site_id uuid references public.sites(id) on delete set null,
  add column if not exists property_address text;

create index if not exists quotes_site_id_idx on public.quotes(site_id);
create index if not exists invoices_site_id_idx on public.invoices(site_id);
