-- Australian (and many other countries) addresses need a state component
-- between suburb/city and postcode. Add it across every entity that
-- captures a postal address.

-- customer_properties is a virtual concept that maps to public.sites in code
-- (see lib/actions/customer-hub.ts → siteToProperty). So adding state to
-- sites is enough; no separate customer_properties table exists.
alter table public.businesses add column if not exists state text;
alter table public.customers  add column if not exists state text;
alter table public.sites      add column if not exists state text;
