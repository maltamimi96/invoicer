-- Customer self-serve portal: magic-link tokens grant scoped read access
-- to a single customer's quotes / invoices / work orders.

create table if not exists public.customer_portal_tokens (
  token            text primary key,
  business_id      uuid not null references public.businesses(id) on delete cascade,
  customer_id      uuid not null references public.customers(id) on delete cascade,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz,
  last_used_at     timestamptz,
  revoked_at       timestamptz
);

create index if not exists idx_cpt_customer on public.customer_portal_tokens(customer_id);
create index if not exists idx_cpt_business on public.customer_portal_tokens(business_id);

alter table public.customer_portal_tokens enable row level security;

drop policy if exists cpt_select on public.customer_portal_tokens;
create policy cpt_select on public.customer_portal_tokens
  for select using (
    business_id in (select id from public.businesses where user_id = auth.uid())
    or business_id in (select business_id from public.business_members where user_id = auth.uid())
  );

drop policy if exists cpt_insert on public.customer_portal_tokens;
create policy cpt_insert on public.customer_portal_tokens
  for insert with check (
    business_id in (select id from public.businesses where user_id = auth.uid())
    or business_id in (select business_id from public.business_members where user_id = auth.uid())
  );

drop policy if exists cpt_update on public.customer_portal_tokens;
create policy cpt_update on public.customer_portal_tokens
  for update using (
    business_id in (select id from public.businesses where user_id = auth.uid())
    or business_id in (select business_id from public.business_members where user_id = auth.uid())
  );

drop policy if exists cpt_delete on public.customer_portal_tokens;
create policy cpt_delete on public.customer_portal_tokens
  for delete using (
    business_id in (select id from public.businesses where user_id = auth.uid())
    or business_id in (select business_id from public.business_members where user_id = auth.uid())
  );
