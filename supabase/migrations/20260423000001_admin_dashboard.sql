-- Admin dashboard: multi-operator, audit-logged, impersonation-capable.
--
-- Design notes:
-- * admin_operators is a separate table from auth.users: an operator is a
--   Supabase user who ALSO has an admin_operators row. Revoking admin access
--   = delete the row (user keeps their regular tenant account if they have one).
-- * All admin actions are logged to admin_audit_log with operator_id, action,
--   target (business/user), and metadata.
-- * Impersonation is explicit, time-boxed, and recorded. The active
--   impersonation is stored in admin_impersonation_sessions; a middleware
--   check surfaces a banner and blocks writes by default until the operator
--   explicitly elevates.

-- ---------- admin_operators ----------
create table if not exists public.admin_operators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'support'
    check (role in ('superadmin', 'billing', 'support', 'read_only')),
  display_name text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  last_seen_at timestamptz
);

create index if not exists idx_admin_operators_user_id on public.admin_operators(user_id);

-- Only superadmins can see or modify the admin_operators table.
alter table public.admin_operators enable row level security;

create policy "admin_operators: superadmin read"
  on public.admin_operators for select
  using (
    exists (
      select 1 from public.admin_operators a
      where a.user_id = auth.uid() and a.role = 'superadmin'
    )
  );

create policy "admin_operators: superadmin write"
  on public.admin_operators for all
  using (
    exists (
      select 1 from public.admin_operators a
      where a.user_id = auth.uid() and a.role = 'superadmin'
    )
  )
  with check (
    exists (
      select 1 from public.admin_operators a
      where a.user_id = auth.uid() and a.role = 'superadmin'
    )
  );

-- ---------- admin_audit_log ----------
create table if not exists public.admin_audit_log (
  id bigserial primary key,
  operator_id uuid not null references public.admin_operators(id) on delete restrict,
  operator_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_type text,
  target_id text,
  target_business_id uuid references public.businesses(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_log_operator on public.admin_audit_log(operator_id, created_at desc);
create index if not exists idx_admin_audit_log_target_business on public.admin_audit_log(target_business_id, created_at desc);
create index if not exists idx_admin_audit_log_created_at on public.admin_audit_log(created_at desc);

alter table public.admin_audit_log enable row level security;

create policy "admin_audit_log: any operator can read"
  on public.admin_audit_log for select
  using (
    exists (
      select 1 from public.admin_operators a where a.user_id = auth.uid()
    )
  );

-- Writes are via service role only (server-side logging).

-- ---------- admin_impersonation_sessions ----------
create table if not exists public.admin_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.admin_operators(id) on delete cascade,
  operator_user_id uuid not null references auth.users(id) on delete cascade,
  target_business_id uuid not null references public.businesses(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  reason text,
  read_only boolean not null default true,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  ended_at timestamptz
);

create index if not exists idx_admin_imp_operator on public.admin_impersonation_sessions(operator_user_id) where ended_at is null;
create index if not exists idx_admin_imp_business on public.admin_impersonation_sessions(target_business_id, started_at desc);

alter table public.admin_impersonation_sessions enable row level security;

create policy "admin_impersonation: operators read"
  on public.admin_impersonation_sessions for select
  using (
    exists (
      select 1 from public.admin_operators a where a.user_id = auth.uid()
    )
  );

-- ---------- Seed: first superadmin ----------
-- Anyone running this migration can promote themselves to superadmin ONCE,
-- if no operator exists yet. After that, only superadmins can add more.
-- The actual seed is done via the /admin/bootstrap route (see app code) so
-- the current auth.uid() is available.
