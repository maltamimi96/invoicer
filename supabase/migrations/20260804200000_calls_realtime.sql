-- Realtime must be told which tables to broadcast; without this the screen pop
-- silently never fires.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END $$;
SELECT string_agg(tablename, ', ') AS realtime_tables FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename IN ('calls','sms_messages');
