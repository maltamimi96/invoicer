create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade not null,
  title            text not null default 'Roof Inspection Report',
  status           text not null default 'draft' check (status in ('draft', 'complete')),
  customer_id      uuid references public.customers(id) on delete set null,
  property_address text,
  inspection_date  date,
  report_date      date not null default current_date,
  sections         jsonb not null default '[]',
  photos           jsonb not null default '[]',
  meta             jsonb not null default '{}',
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table public.reports enable row level security;

create policy "Users can manage own reports" on public.reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
