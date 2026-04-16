-- Per-business email scanning configuration
create table public.business_email_config (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null unique references public.businesses(id) on delete cascade,
  enabled       boolean not null default false,
  provider      text not null default 'custom',   -- gmail, outlook, yahoo, hostinger, custom
  imap_host     text not null,
  imap_port     integer not null default 993,
  imap_user     text not null,
  imap_pass     text not null,
  last_checked  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_email_config_business on public.business_email_config(business_id);
create index idx_email_config_enabled on public.business_email_config(enabled) where enabled = true;

alter table public.business_email_config enable row level security;
