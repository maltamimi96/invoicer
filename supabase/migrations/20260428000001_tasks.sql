-- Kanban-style tasks. Per-business board, optional assignee (member or "general").
-- Status enum drives the columns; position orders tasks within a column.

create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','in_review','done')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assignee_user_id uuid references auth.users(id) on delete set null,
  due_date date,
  position integer not null default 0,
  created_by uuid not null references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_business_status_idx on public.tasks (business_id, status, position);
create index if not exists tasks_business_assignee_idx on public.tasks (business_id, assignee_user_id);

alter table public.tasks enable row level security;

-- Read: owners + active members of the business
create policy "tasks_select_business" on public.tasks
  for select using (
    exists (select 1 from public.businesses b where b.id = tasks.business_id and b.user_id = auth.uid())
    or exists (
      select 1 from public.business_members m
      where m.business_id = tasks.business_id and m.user_id = auth.uid() and m.status = 'active'
    )
  );

-- Insert: owners + members with role admin/manager/staff (not viewer)
create policy "tasks_insert_business" on public.tasks
  for insert with check (
    exists (select 1 from public.businesses b where b.id = tasks.business_id and b.user_id = auth.uid())
    or exists (
      select 1 from public.business_members m
      where m.business_id = tasks.business_id and m.user_id = auth.uid() and m.status = 'active'
        and m.role in ('admin','manager','staff')
    )
  );

-- Update: same as insert
create policy "tasks_update_business" on public.tasks
  for update using (
    exists (select 1 from public.businesses b where b.id = tasks.business_id and b.user_id = auth.uid())
    or exists (
      select 1 from public.business_members m
      where m.business_id = tasks.business_id and m.user_id = auth.uid() and m.status = 'active'
        and m.role in ('admin','manager','staff')
    )
  );

-- Delete: owners + admin/manager only
create policy "tasks_delete_business" on public.tasks
  for delete using (
    exists (select 1 from public.businesses b where b.id = tasks.business_id and b.user_id = auth.uid())
    or exists (
      select 1 from public.business_members m
      where m.business_id = tasks.business_id and m.user_id = auth.uid() and m.status = 'active'
        and m.role in ('admin','manager')
    )
  );

create or replace function public.tasks_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.tasks_set_updated_at();
