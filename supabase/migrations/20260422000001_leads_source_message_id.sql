-- Track the source email's Message-ID for dedupe during daily inbox scans.
alter table public.leads
  add column if not exists source_message_id text;

create unique index if not exists leads_business_source_message_id_idx
  on public.leads (business_id, source_message_id)
  where source_message_id is not null;
