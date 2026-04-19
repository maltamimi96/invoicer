-- Per-business outgoing webhooks for Zapier / external integrations
create table public.business_webhooks (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  url           text not null,
  label         text not null,
  events        text[] not null default '{}',
  secret        text,                              -- optional signing secret for HMAC verification
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_webhooks_business on public.business_webhooks(business_id);
create index idx_webhooks_enabled on public.business_webhooks(enabled) where enabled = true;

-- Log of webhook deliveries for debugging
create table public.webhook_deliveries (
  id            uuid primary key default gen_random_uuid(),
  webhook_id    uuid not null references public.business_webhooks(id) on delete cascade,
  event         text not null,
  status_code   integer,
  success       boolean not null default false,
  payload       jsonb,
  response_body text,
  error         text,
  created_at    timestamptz not null default now()
);

create index idx_deliveries_webhook on public.webhook_deliveries(webhook_id);
create index idx_deliveries_created on public.webhook_deliveries(created_at);

alter table public.business_webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;
