-- Dashboard stats as a single SQL aggregate.
--
-- getDashboardStats() previously fetched EVERY invoice row for the business
-- (all columns it needed, all history) into Node on every dashboard load and
-- reduced in JS. This RPC computes the same shape in one round trip:
--   { totalRevenue, outstanding, overdue, paidThisMonth,
--     recentInvoices[5], monthlyData[6] }
--
-- SECURITY INVOKER — RLS applies exactly as it did to the old direct query
-- (workers are blocked from invoices by invoices_no_workers; they get an
-- empty result, not an error). Also fixes a latent bug: "recent invoices"
-- had no ORDER BY (arbitrary rows); now it's created_at DESC.
create or replace function public.dashboard_stats(biz uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with inv as (
    select id, number, total::numeric as total, amount_paid::numeric as amount_paid,
           status, issue_date, due_date, created_at, customer_id
    from invoices
    where business_id = biz
  ),
  months as (
    select date_trunc('month', now()) - make_interval(months => s) as m
    from generate_series(5, 0, -1) as s
  ),
  monthly as (
    select m.m,
           trim(to_char(m.m, 'Mon')) as month,
           coalesce(sum(i.total) filter (where i.status = 'paid'), 0) as revenue,
           coalesce(sum(i.total), 0) as invoiced
    from months m
    left join inv i on date_trunc('month', i.created_at) = m.m
    group by m.m
  ),
  recent as (
    select i.id, i.number, i.total, i.amount_paid, i.status, i.issue_date, i.due_date, i.created_at,
           case when c.id is null then null else jsonb_build_object('name', c.name) end as customers
    from inv i
    left join customers c on c.id = i.customer_id
    order by i.created_at desc
    limit 5
  )
  select jsonb_build_object(
    'totalRevenue',  coalesce((select sum(total) from inv where status = 'paid'), 0),
    'outstanding',   coalesce((select sum(total - amount_paid) from inv where status in ('sent','partial')), 0),
    -- due today counts as overdue, matching the old JS (new Date(due_date) < now)
    'overdue',       coalesce((select sum(total - amount_paid) from inv
                               where status in ('sent','partial') and due_date <= now()::date), 0),
    'paidThisMonth', coalesce((select sum(total) from inv
                               where status = 'paid' and created_at >= date_trunc('month', now())), 0),
    'monthlyData',   (select coalesce(jsonb_agg(jsonb_build_object(
                        'month', month, 'revenue', revenue, 'invoiced', invoiced) order by m), '[]'::jsonb)
                      from monthly),
    'recentInvoices',(select coalesce(jsonb_agg(to_jsonb(r) - 'created_at' order by r.created_at desc), '[]'::jsonb)
                      from recent r)
  );
$$;

grant execute on function public.dashboard_stats(uuid) to authenticated;
