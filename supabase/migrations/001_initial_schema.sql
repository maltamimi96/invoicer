-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- BUSINESSES
-- ============================================================
create table if not exists public.businesses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  email text,
  phone text,
  address text,
  city text,
  postcode text,
  country text default 'United Kingdom',
  website text,
  tax_number text,
  logo_url text,
  currency text not null default 'GBP',
  locale text not null default 'en-GB',
  invoice_prefix text not null default 'INV',
  invoice_next_number integer not null default 1,
  quote_prefix text not null default 'QUO',
  quote_next_number integer not null default 1,
  payment_terms text default 'Payment due within 30 days of invoice date.',
  default_notes text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_sort_code text,
  bank_iban text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  email text,
  phone text,
  address text,
  city text,
  postcode text,
  country text,
  company text,
  tax_number text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PRODUCTS / SERVICES
-- ============================================================
create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  unit_price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  unit text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- INVOICES
-- ============================================================
create table if not exists public.invoices (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  number text not null,
  status text not null default 'draft' check (status in ('draft','sent','paid','overdue','cancelled','partial')),
  customer_id uuid references public.customers(id) on delete set null,
  issue_date date not null default current_date,
  due_date date not null,
  line_items jsonb not null default '[]',
  subtotal numeric(12,2) not null default 0,
  discount_type text check (discount_type in ('percent','fixed')),
  discount_value numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  notes text,
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- QUOTES
-- ============================================================
create table if not exists public.quotes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  number text not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  customer_id uuid references public.customers(id) on delete set null,
  issue_date date not null default current_date,
  expiry_date date not null,
  line_items jsonb not null default '[]',
  subtotal numeric(12,2) not null default 0,
  discount_type text check (discount_type in ('percent','fixed')),
  discount_value numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  terms text,
  invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PAYMENTS
-- ============================================================
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid references public.invoices(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  amount numeric(12,2) not null,
  date date not null default current_date,
  method text,
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_businesses
  before update on public.businesses
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_customers
  before update on public.customers
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_products
  before update on public.products
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_invoices
  before update on public.invoices
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_quotes
  before update on public.quotes
  for each row execute function public.handle_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.businesses enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.quotes enable row level security;
alter table public.payments enable row level security;

-- Businesses policies
create policy "Users can view own business" on public.businesses for select using (auth.uid() = user_id);
create policy "Users can insert own business" on public.businesses for insert with check (auth.uid() = user_id);
create policy "Users can update own business" on public.businesses for update using (auth.uid() = user_id);

-- Customers policies
create policy "Users can view own customers" on public.customers for select using (auth.uid() = user_id);
create policy "Users can insert own customers" on public.customers for insert with check (auth.uid() = user_id);
create policy "Users can update own customers" on public.customers for update using (auth.uid() = user_id);
create policy "Users can delete own customers" on public.customers for delete using (auth.uid() = user_id);

-- Products policies
create policy "Users can view own products" on public.products for select using (auth.uid() = user_id);
create policy "Users can insert own products" on public.products for insert with check (auth.uid() = user_id);
create policy "Users can update own products" on public.products for update using (auth.uid() = user_id);
create policy "Users can delete own products" on public.products for delete using (auth.uid() = user_id);

-- Invoices policies
create policy "Users can view own invoices" on public.invoices for select using (auth.uid() = user_id);
create policy "Users can insert own invoices" on public.invoices for insert with check (auth.uid() = user_id);
create policy "Users can update own invoices" on public.invoices for update using (auth.uid() = user_id);
create policy "Users can delete own invoices" on public.invoices for delete using (auth.uid() = user_id);

-- Quotes policies
create policy "Users can view own quotes" on public.quotes for select using (auth.uid() = user_id);
create policy "Users can insert own quotes" on public.quotes for insert with check (auth.uid() = user_id);
create policy "Users can update own quotes" on public.quotes for update using (auth.uid() = user_id);
create policy "Users can delete own quotes" on public.quotes for delete using (auth.uid() = user_id);

-- Payments policies
create policy "Users can view own payments" on public.payments for select using (auth.uid() = user_id);
create policy "Users can insert own payments" on public.payments for insert with check (auth.uid() = user_id);
create policy "Users can delete own payments" on public.payments for delete using (auth.uid() = user_id);

-- ============================================================
-- STORAGE BUCKETS (run in dashboard or via Supabase CLI)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('logos', 'logos', true);
-- create policy "Users can upload logos" on storage.objects for insert with check (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);
-- create policy "Logos are publicly viewable" on storage.objects for select using (bucket_id = 'logos');
-- create policy "Users can update their logos" on storage.objects for update using (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);
-- create policy "Users can delete their logos" on storage.objects for delete using (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);
