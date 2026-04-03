alter table public.businesses
  add column if not exists sidebar_theme text not null default 'dark-navy';
