-- Per-user dismissals/snoozes for AI briefing items.
-- The briefing itself is computed from live data each time getMyBriefing()
-- runs — this table lets users hide individual items ('snooze for 24h',
-- 'dismiss' until something changes about that entity).

create table if not exists public.briefing_dismissals (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  briefing_type text not null,                     -- e.g. 'overdue_invoice', 'stale_quote'
  entity_id     uuid not null,                     -- the doc/lead/job/etc this is about
  snoozed_until timestamptz,                       -- null = dismissed forever
  dismissed     boolean not null default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- One dismissal per (user, type, entity) — re-snooze just updates the row.
create unique index if not exists briefing_dismissals_unique
  on public.briefing_dismissals (business_id, user_id, briefing_type, entity_id);

create index if not exists briefing_dismissals_lookup
  on public.briefing_dismissals (business_id, user_id);

alter table public.briefing_dismissals enable row level security;

create policy "users manage own briefing dismissals"
  on public.briefing_dismissals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
