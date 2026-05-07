-- Optional override for the alphanumeric SMS Sender ID a business uses.
-- When null, the SMS code derives one from business.name (sanitised to 11
-- alphanum chars). Saved on businesses so it can be edited from Settings.
alter table public.businesses
  add column if not exists sms_sender_id text;
