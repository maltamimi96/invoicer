-- Add appearance customisation columns to businesses
alter table public.businesses
  add column if not exists accent_color text not null default 'blue',
  add column if not exists bg_pattern   text not null default 'none';
