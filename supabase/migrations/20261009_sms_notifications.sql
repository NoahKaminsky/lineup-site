-- SMS notification opt-in.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- profiles.phone_number already exists but is currently unused anywhere in
-- the app (0 of 31 real profiles have it set -- checked live). This adds
-- the consent flag: SMS is never sent just because a phone number is on
-- file (e.g. for display, or a professional's contact info) -- only when
-- this is explicitly true. Defaults to false (opt-in, not opt-out), same
-- reasoning as marketing_consent elsewhere in this table.

alter table profiles add column if not exists sms_notifications_enabled boolean not null default false;
