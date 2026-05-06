-- Schedule an invoice/quote to be emailed (or SMS'd) at a future moment.
-- A cron pulls 'pending' rows whose send_at has passed and dispatches them
-- via the same server actions used for immediate sends.

create table if not exists public.scheduled_sends (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  doc_type      text not null check (doc_type in ('invoice','quote')),
  doc_id        uuid not null,
  channel       text not null default 'email' check (channel in ('email','sms')),
  send_at       timestamptz not null,
  recipients    text[],
  to_phone      text,
  subject       text,
  body          text,
  status        text not null default 'pending' check (status in ('pending','sending','sent','cancelled','failed')),
  attempt_count int not null default 0,
  last_error    text,
  sent_at       timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists scheduled_sends_due_idx on public.scheduled_sends (status, send_at)
  where status in ('pending','sending');
create index if not exists scheduled_sends_doc_idx on public.scheduled_sends (business_id, doc_type, doc_id, status);

alter table public.scheduled_sends enable row level security;

create policy "members read own business scheduled sends"
  on public.scheduled_sends
  for select
  using (
    exists (
      select 1 from public.business_members bm
      where bm.business_id = scheduled_sends.business_id
        and bm.user_id = auth.uid()
        and bm.status = 'active'
    )
    or exists (
      select 1 from public.businesses b
      where b.id = scheduled_sends.business_id
        and b.user_id = auth.uid()
    )
  );

create policy "members manage own business scheduled sends"
  on public.scheduled_sends
  for all
  using (
    exists (
      select 1 from public.business_members bm
      where bm.business_id = scheduled_sends.business_id
        and bm.user_id = auth.uid()
        and bm.status = 'active'
        and bm.role in ('owner','admin','staff')
    )
    or exists (
      select 1 from public.businesses b
      where b.id = scheduled_sends.business_id
        and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.business_members bm
      where bm.business_id = scheduled_sends.business_id
        and bm.user_id = auth.uid()
        and bm.status = 'active'
        and bm.role in ('owner','admin','staff')
    )
    or exists (
      select 1 from public.businesses b
      where b.id = scheduled_sends.business_id
        and b.user_id = auth.uid()
    )
  );
