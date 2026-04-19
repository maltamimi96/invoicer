-- Per-business API keys for external integrations
create table public.business_api_keys (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  user_id       uuid not null,
  label         text not null,
  key_prefix    text not null,
  key_hash      text not null,
  scopes        text[] not null default '{}',
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz
);

-- Fast lookup by hash (hot path for every API call)
create unique index idx_api_keys_hash on public.business_api_keys(key_hash);

-- List keys for a business (settings UI)
create index idx_api_keys_business on public.business_api_keys(business_id);

-- RLS enabled but no policies — only the admin (service role) client accesses this table
alter table public.business_api_keys enable row level security;
