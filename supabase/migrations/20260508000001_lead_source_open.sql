-- Allow arbitrary lead sources — was locked to 7 hardcoded values via CHECK
-- but tradies need to capture HiPages, ServiceSeeking, Yellow Pages, word-
-- of-mouth, etc. Free-text now; the UI offers a dropdown of past sources
-- plus a 'type your own' input.

alter table public.leads drop constraint if exists leads_source_check;
