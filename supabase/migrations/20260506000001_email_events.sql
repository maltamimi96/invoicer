-- Track every outbound email + delivery events so the user can see whether a
-- customer actually received an invoice/quote. Resend webhooks update the
-- status fields as the lifecycle progresses (delivered/bounced/opened).

create table if not exists public.email_events (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  resend_id    text,
  doc_type     text not null check (doc_type in ('invoice','quote','team_invite','lead','custom')),
  doc_id       uuid,
  recipient    text not null,
  subject      text,
  status       text not null default 'sent' check (status in ('queued','sent','delivered','bounced','complained','opened','clicked','failed','delivery_delayed')),
  error        text,
  sent_at      timestamptz default now(),
  delivered_at timestamptz,
  opened_at    timestamptz,
  clicked_at   timestamptz,
  bounced_at   timestamptz,
  raw          jsonb,
  created_at   timestamptz default now()
);

create index if not exists email_events_doc_idx        on public.email_events (business_id, doc_type, doc_id, created_at desc);
create index if not exists email_events_resend_id_idx  on public.email_events (resend_id) where resend_id is not null;
create index if not exists email_events_recipient_idx  on public.email_events (business_id, recipient, created_at desc);

alter table public.email_events enable row level security;

-- Members of the business can read their email events.
create policy "members read business email events"
  on public.email_events
  for select
  using (
    exists (
      select 1 from public.business_members bm
      where bm.business_id = email_events.business_id
        and bm.user_id = auth.uid()
        and bm.status = 'active'
    )
    or exists (
      select 1 from public.businesses b
      where b.id = email_events.business_id
        and b.user_id = auth.uid()
    )
  );

-- Inserts/updates only happen via service-role (server actions + webhooks).
-- No insert/update policy → blocked for end users by default.
