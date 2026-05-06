-- Vercel Hobby tier only allows once-daily crons, but scheduled-sends need
-- per-minute granularity to dispatch on time. Use Supabase's built-in pg_cron
-- to ping the Vercel cron endpoint every minute — same auth as Vercel cron
-- (Bearer CRON_SECRET), routes through pg_net.
--
-- Required Supabase Vault secrets (set via the dashboard before this runs):
--   - app_url        e.g. https://invoicer.crownroofers.com.au
--   - cron_secret    same value as Vercel's CRON_SECRET env var
--
-- If those secrets aren't set, the schedule is created but the call is a
-- no-op until they're populated.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  app_url     text;
  cron_secret text;
begin
  -- Vault may not exist on every project — fall back gracefully.
  begin
    select decrypted_secret into app_url     from vault.decrypted_secrets where name = 'app_url'     limit 1;
    select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  exception when others then
    app_url := null;
  end;

  -- Drop any prior scheduling so reruns are idempotent.
  perform cron.unschedule('process-scheduled-sends')
  where exists (select 1 from cron.job where jobname = 'process-scheduled-sends');

  if app_url is not null and cron_secret is not null then
    perform cron.schedule(
      'process-scheduled-sends',
      '* * * * *',
      format(
        $f$
          select net.http_get(
            url     := %L || '/api/cron/process-scheduled-sends',
            headers := jsonb_build_object('Authorization', 'Bearer ' || %L)
          );
        $f$,
        app_url, cron_secret
      )
    );
  end if;
end $$;
