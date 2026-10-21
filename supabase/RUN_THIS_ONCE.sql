-- LineUp: everything to run once in Supabase.
-- Supabase dashboard -> SQL Editor -> New query -> paste ALL of this -> Run.
-- Safe to run more than once.

-- ================================================================
-- 20261017_lock_down_sensitive_columns.sql
-- ================================================================
-- Security hardening: stop users editing fields that grant trust, money or
-- admin powers, even if they call the database directly with their own login.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Why: the app writes to `profiles` from the browser (name, bio, settings),
-- so a row-level "users can update their own profile" rule also lets a user
-- send { is_admin: true } or { subscription_plan: 'master' } for their own
-- row. Same idea for bookings, whose payout amounts decide how much money
-- Stripe sends a professional. The server (service role) is unaffected.

-- 1. Profiles: admin, featured, subscription and Stripe fields are server-only.
create or replace function protect_profile_privileged_fields()
returns trigger
language plpgsql
as $$
declare
  col text;
  locked text[] := array[
    'is_admin',
    'is_featured',
    'is_founding_artist',
    'subscription_plan',
    'subscription_status',
    'subscription_current_period_end',
    'stripe_customer_id',
    'stripe_subscription_id',
    'stripe_account_id',
    'stripe_onboarding_complete',
    'stripe_charges_enabled',
    'stripe_payouts_enabled'
  ];
  new_json jsonb := to_jsonb(new);
  old_json jsonb;
begin
  -- The SQL editor and server-side (service role) calls are trusted.
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A brand-new profile can't start out as an admin, featured, paid or
    -- linked to someone else's Stripe account.
    if coalesce((new_json ->> 'is_admin')::boolean, false)
       or coalesce((new_json ->> 'is_featured')::boolean, false)
       or coalesce((new_json ->> 'is_founding_artist')::boolean, false)
       -- Only paid plans are blocked: a column default like 'basic' is fine.
       or coalesce(new_json ->> 'subscription_plan', '') in ('apprentice', 'pro', 'master')
       or new_json ->> 'stripe_customer_id' is not null
       or new_json ->> 'stripe_subscription_id' is not null
       or new_json ->> 'stripe_account_id' is not null then
      raise exception 'Those profile fields can only be set by LineUp.';
    end if;
    return new;
  end if;

  old_json := to_jsonb(old);
  foreach col in array locked loop
    if (new_json -> col) is distinct from (old_json -> col) then
      raise exception 'The % field can only be changed by LineUp.', col;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_fields on profiles;
create trigger protect_profile_privileged_fields
  before insert or update on profiles
  for each row execute function protect_profile_privileged_fields();

-- 2. Bookings: only the server creates, changes or deletes them. (The app
--    never writes bookings from the browser; payment, completion and
--    cancellation all go through API routes that check who's asking.)
create or replace function bookings_server_only()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return coalesce(new, old);
  end if;
  raise exception 'Bookings can only be changed by LineUp.';
end;
$$;

drop trigger if exists bookings_server_only on bookings;
create trigger bookings_server_only
  before insert or update or delete on bookings
  for each row execute function bookings_server_only();

-- 3. Verification documents bucket must stay private.
update storage.buckets set public = false where id = 'verification-documents';


-- ---------------------------------------------------------------------------
-- CHECK-UP (read-only). Run these after the above and look at the results:
--
-- a) Every table should say rls_enabled = true. Any "false" means anyone with
--    the public anon key can read and write that whole table.
--
--   select relname as table_name, relrowsecurity as rls_enabled
--   from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r'
--   order by relrowsecurity, relname;
--
-- b) The rules on each table. Look for policies whose "qual" is just "true"
--    on tables holding private data (bookings, booking_messages,
--    notifications, push_subscriptions, lineup_signups, profiles).
--
--   select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename, cmd;
-- ---------------------------------------------------------------------------


-- ================================================================
-- 20261017_verification_id_document.sql
-- ================================================================
-- Verification now asks for two files: the credential (or proof of
-- enrollment) and a government-issued photo ID, so reviewers can match the
-- document to the person. The ID lives in the same private bucket.
--
-- Until this runs, /api/verification/submit still accepts submissions and
-- records the ID's storage path in admin_note instead.

alter table professional_verifications
  add column if not exists id_document_path text;


-- ================================================================
-- 20261017_auto_enable_direct_booking.sql
-- ================================================================
-- Turn the instant-booking calendar on (and off) with the subscription,
-- however the subscription gets set.
--
-- Stripe checkout (webhook) and /admin already do this in app code, but a
-- plan edited directly in the Supabase table editor skipped it, leaving a
-- paying pro with no calendar on their profile. This trigger covers every
-- path at the database level.
--
-- It only reacts to a CHANGE between "live" and "not live" (live = a paid
-- plan with status active or trialing). So a pro who deliberately turns
-- direct booking off in Services keeps it off; renewals and other updates
-- leave their choice alone.

create or replace function sync_direct_booking_with_subscription()
returns trigger
language plpgsql
as $$
declare
  was_live boolean := coalesce(old.subscription_plan, '') in ('apprentice', 'pro', 'master')
                      and coalesce(old.subscription_status, '') in ('active', 'trialing');
  is_live boolean := coalesce(new.subscription_plan, '') in ('apprentice', 'pro', 'master')
                     and coalesce(new.subscription_status, '') in ('active', 'trialing');
begin
  if is_live and not was_live then
    new.direct_booking_enabled := true;
    new.public_availability_enabled := true;
  elsif was_live and not is_live then
    new.direct_booking_enabled := false;
    new.public_availability_enabled := false;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_direct_booking_with_subscription on profiles;
create trigger sync_direct_booking_with_subscription
  before update of subscription_plan, subscription_status on profiles
  for each row
  execute function sync_direct_booking_with_subscription();

-- One-time fix for the account that was upgraded by hand before this
-- trigger existed (already live, so the trigger alone won't flip it).
update profiles
set direct_booking_enabled = true,
    public_availability_enabled = true
where email = 'lineupmb@gmail.com'
  and subscription_plan in ('apprentice', 'pro', 'master')
  and subscription_status in ('active', 'trialing');


-- ================================================================
-- 20261017_request_dismissals.sql
-- ================================================================
-- Professionals can dismiss an open request they don't want to respond to,
-- clearing it from their dashboard and Work lists on every device.
-- (Until this runs, dismissals are kept per device in localStorage.)

create table if not exists request_dismissals (
  professional_id uuid not null references profiles(id) on delete cascade,
  request_id uuid not null references service_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (professional_id, request_id)
);

alter table request_dismissals enable row level security;

drop policy if exists "pros manage own dismissals" on request_dismissals;
create policy "pros manage own dismissals"
  on request_dismissals for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);


-- ================================================================
-- 20261017_clean_service_labels.sql
-- ================================================================
-- Requests used to store their service as "Category: Service" ("Hair:
-- Haircut", or several joined with " • "), and request-flow bookings copied
-- that into service_name. New requests store just the services; this tidies
-- the rows saved before that change. Safe to run more than once.

update service_requests
set service_detail = regexp_replace(service_detail, '(^|•\s*)[^:•]{1,40}:\s*', '\1', 'g')
where service_detail ~ '(^|•\s*)[^:•]{1,40}:\s*';

update bookings
set service_name = regexp_replace(service_name, '(^|•\s*)[^:•]{1,40}:\s*', '\1', 'g')
where service_name ~ '(^|•\s*)[^:•]{1,40}:\s*';


-- ================================================================
-- 20261017_completion_nudges.sql
-- ================================================================
-- Tracks the one "your appointment has ended, mark it complete" nudge each
-- booking gets (see app/api/cron/completion-nudges).
alter table bookings
  add column if not exists completion_nudge_sent_at timestamptz;


-- ================================================================
-- 20261018_service_areas.sql
-- ================================================================
-- Service areas: professionals only hear about (and see) requests inside
-- their area, so a Winnipeg pro isn't offered a Regina request.
--
-- profiles.service_radius_km: how far from their base (the location saved
-- in Services) they'll go. NULL = anywhere. Existing pros start at 50 km.
-- service_requests.area_*: an approximate point (rounded to ~1 km) and a
-- city-level label for every request, so matching and display never need
-- the customer's exact address.

alter table profiles
  add column if not exists service_radius_km integer default 50;

alter table service_requests
  add column if not exists area_lat double precision,
  add column if not exists area_lng double precision,
  add column if not exists area_label text;

-- Backfill an approximate point for existing at-home requests.
update service_requests
set area_lat = round(location_lat::numeric, 2),
    area_lng = round(location_lng::numeric, 2)
where area_lat is null and location_lat is not null and location_lng is not null;


-- ================================================================
-- 20261021_backfill_direct_booking.sql
-- ================================================================
-- Every paying professional gets instant booking on, without touching a
-- setting. New and changed subscriptions already do this (Stripe webhook,
-- /admin, and the sync_direct_booking_with_subscription trigger); this
-- catches pros who were already paying before those existed and still have
-- it switched off.
update profiles
set direct_booking_enabled = true,
    public_availability_enabled = true
where subscription_plan in ('apprentice', 'pro', 'master')
  and subscription_status in ('active', 'trialing')
  and (not coalesce(direct_booking_enabled, false)
       or not coalesce(public_availability_enabled, false));


-- ================================================================
-- 20261021_time_off_and_booking_window.sql
-- ================================================================
-- Scheduling controls for professionals:
--   1. How far ahead clients can book (profiles.booking_window_days).
--      Empty means the default of 8 weeks.
--   2. Time off: date ranges a pro is away, without touching their weekly
--      hours. Clients see no open times on those days.
-- Safe to run more than once.

alter table profiles
  add column if not exists booking_window_days integer;

alter table profiles
  drop constraint if exists profiles_booking_window_days_check;
alter table profiles
  add constraint profiles_booking_window_days_check
  check (booking_window_days is null or booking_window_days between 1 and 56);

create table if not exists professional_time_off (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint professional_time_off_dates check (end_date >= start_date)
);

create index if not exists professional_time_off_pro_dates
  on professional_time_off (professional_id, end_date);

alter table professional_time_off enable row level security;

-- Pros manage their own time off. Clients never read it directly: the
-- server only shares which days are unavailable.
drop policy if exists "pros manage own time off" on professional_time_off;
create policy "pros manage own time off" on professional_time_off
  for all to authenticated
  using (professional_id = auth.uid())
  with check (professional_id = auth.uid());
