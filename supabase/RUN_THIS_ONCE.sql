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


-- ================================================================
-- 20261029_studios.sql
-- ================================================================
-- Studio accounts: a salon, shop or studio signs up once, the owner runs it
-- from /studio, and every pro on the team keeps their own LineUp login and
-- profile, housed under the studio.
--
--   studios         one row per shop: name, plan, billing, the shop's cut
--   studio_members  who's on the team (owner, managers, members, invites)
--   profiles        studio_id / plan_source: which shop a pro belongs to, and
--                   whether their plan comes from the shop's subscription
--   bookings        studio_id / studio_cut_cents: the shop's share of each
--                   booking, paid to the shop's Stripe account at completion
--
-- Everything here is written only by the server (service role). Signed-in
-- users can read their own studio and team; nobody can edit it directly.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. Studios -----------------------------------------------------------------
create table if not exists studios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  owner_id uuid not null references profiles(id) on delete cascade,
  -- 'studio' ($39/mo) or 'studio_plus' ($99/mo); null until they subscribe.
  plan text check (plan is null or plan in ('studio', 'studio_plus')),
  subscription_status text,
  subscription_current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  -- The shop's default cut of each member's bookings (after LineUp's fee).
  -- Capped at 70% so it always fits inside what's left after the deposit.
  commission_percent numeric(5,2) not null default 0
    check (commission_percent >= 0 and commission_percent <= 70),
  -- Where the shop's cut is paid (Stripe Connect account owned by the shop).
  stripe_account_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists studios_owner_idx on studios (owner_id);
create index if not exists studios_stripe_subscription_idx on studios (stripe_subscription_id);

-- 2. Team members ------------------------------------------------------------
create table if not exists studio_members (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  -- Null while the invite hasn't been accepted yet.
  profile_id uuid references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'manager', 'member')),
  status text not null default 'invited' check (status in ('invited', 'active')),
  invited_email text,
  -- SHA-256 of the invite link's token; the raw token only ever lives in the email.
  invite_token_hash text,
  invite_expires_at timestamptz,
  -- This member's own split, overriding the studio default. Null = default.
  commission_percent numeric(5,2)
    check (commission_percent is null or (commission_percent >= 0 and commission_percent <= 70)),
  invited_by uuid references profiles(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now()
);

-- A pro belongs to at most one studio.
create unique index if not exists studio_members_one_studio_per_pro
  on studio_members (profile_id) where profile_id is not null;
-- No duplicate open invites for the same email at the same studio.
create unique index if not exists studio_members_one_invite_per_email
  on studio_members (studio_id, lower(invited_email)) where status = 'invited';
create index if not exists studio_members_studio_idx on studio_members (studio_id);
create index if not exists studio_members_token_idx on studio_members (invite_token_hash);

-- 3. Profiles and bookings ---------------------------------------------------
alter table profiles
  add column if not exists studio_id uuid references studios(id) on delete set null,
  -- 'studio' when subscription_plan/status were granted by the studio's plan
  -- (so leaving the studio, or the studio lapsing, takes them away again
  -- without touching a pro's own paid subscription).
  add column if not exists plan_source text;

alter table bookings
  add column if not exists studio_id uuid references studios(id) on delete set null,
  add column if not exists studio_cut_cents integer not null default 0,
  add column if not exists stripe_studio_transfer_id text;

create index if not exists bookings_studio_idx on bookings (studio_id, booking_date);

-- 4. Nobody but the server can move a pro in or out of a studio, or mark a
--    plan as studio-granted.
create or replace function protect_profile_studio_fields()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.studio_id is not null or new.plan_source is not null then
      raise exception 'Studio fields can only be set by LineUp.';
    end if;
    return new;
  end if;

  if new.studio_id is distinct from old.studio_id
     or new.plan_source is distinct from old.plan_source then
    raise exception 'Studio fields can only be changed by LineUp.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_studio_fields on profiles;
create trigger protect_profile_studio_fields
  before insert or update on profiles
  for each row execute function protect_profile_studio_fields();

-- 5. Row-level security: read-only for the team, writes are server-only.
alter table studios enable row level security;
alter table studio_members enable row level security;

-- Is the signed-in user an active member of this studio? (security definer so
-- the policy on studio_members can check studio_members without recursing.)
create or replace function is_studio_member(target_studio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from studio_members
    where studio_id = target_studio
      and profile_id = auth.uid()
      and status = 'active'
  );
$$;

drop policy if exists "team reads own studio" on studios;
create policy "team reads own studio" on studios
  for select to authenticated
  using (owner_id = auth.uid() or is_studio_member(id));

drop policy if exists "team reads own roster" on studio_members;
create policy "team reads own roster" on studio_members
  for select to authenticated
  using (is_studio_member(studio_id));


-- ================================================================
-- 20261030_front_desk_and_booth_rent.sql
-- ================================================================
-- Studio front desk and booth rent. Run after 20261029_studios.sql.
-- Safe to re-run.
--
--   shop_appointments  walk-ins and phone-ins a studio books by hand. They're
--                      paid at the shop, not through LineUp, so they live
--                      apart from `bookings` (no payouts, no client account).
--                      They still block those times for online booking.
--   studio_members     each pro is on commission or booth rent; booth rent is
--                      a Stripe subscription the pro pays, sent to the shop.

-- 1. Front-desk appointments --------------------------------------------------
create table if not exists shop_appointments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  professional_id uuid not null references profiles(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  kind text not null default 'walk_in' check (kind in ('walk_in', 'phone')),
  client_name text not null check (char_length(client_name) between 1 and 80),
  client_phone text check (client_phone is null or char_length(client_phone) <= 30),
  service_name text not null check (char_length(service_name) between 1 and 120),
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  -- What the client pays at the shop (cash or the shop's own card machine).
  price_cents integer check (price_cents is null or price_cents between 0 and 10000000),
  -- The shop's share for its records (commission pros on Studio Plus);
  -- nothing is transferred, since the money never went through LineUp.
  shop_cut_cents integer not null default 0 check (shop_cut_cents >= 0),
  status text not null default 'booked' check (status in ('booked', 'completed', 'cancelled', 'no_show')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint shop_appointments_times check (end_time > start_time)
);

create index if not exists shop_appointments_pro_date on shop_appointments (professional_id, appointment_date);
create index if not exists shop_appointments_studio_date on shop_appointments (studio_id, appointment_date);

-- Two front-desk appointments for the same pro can never overlap. (Clashes
-- with online bookings are checked by the app on both sides.)
create extension if not exists btree_gist;
alter table shop_appointments drop constraint if exists shop_appointments_no_overlap;
alter table shop_appointments
  add constraint shop_appointments_no_overlap
  exclude using gist (
    professional_id with =,
    tsrange(appointment_date + start_time, appointment_date + end_time, '[)') with &&
  )
  where (status in ('booked', 'completed'));

alter table shop_appointments enable row level security;

-- 2. Commission or booth rent, per pro --------------------------------------
alter table studio_members
  add column if not exists arrangement text not null default 'commission',
  add column if not exists rent_cents integer,
  add column if not exists rent_interval text,
  add column if not exists rent_subscription_id text,
  add column if not exists rent_status text,
  add column if not exists rent_current_period_end timestamptz;

alter table studio_members drop constraint if exists studio_members_arrangement_check;
alter table studio_members
  add constraint studio_members_arrangement_check check (arrangement in ('commission', 'booth_rent'));
alter table studio_members drop constraint if exists studio_members_rent_check;
alter table studio_members
  add constraint studio_members_rent_check check (
    (rent_cents is null or rent_cents between 500 and 1000000)
    and (rent_interval is null or rent_interval in ('week', 'month'))
  );

create index if not exists studio_members_rent_subscription_idx on studio_members (rent_subscription_id);

-- 3. Who can read what -------------------------------------------------------
-- Commission rates and rent are between the shop and each pro, so members
-- only see their own row; the owner and managers see the whole team.
create or replace function is_studio_manager(target_studio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from studio_members
    where studio_id = target_studio
      and profile_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'manager')
  );
$$;

drop policy if exists "team reads own roster" on studio_members;
drop policy if exists "members read own row, managers read team" on studio_members;
create policy "members read own row, managers read team" on studio_members
  for select to authenticated
  using (profile_id = auth.uid() or is_studio_manager(studio_id));

drop policy if exists "pros and managers read front desk" on shop_appointments;
create policy "pros and managers read front desk" on shop_appointments
  for select to authenticated
  using (professional_id = auth.uid() or is_studio_manager(studio_id));


-- ================================================================
-- 20261031_studio_booking_page.sql
-- ================================================================
-- One public booking page per studio: lineup-aesthetics.ca/shop/<slug>.
-- Run after 20261030_front_desk_and_booth_rent.sql. Safe to re-run.

alter table studios
  add column if not exists slug text,
  add column if not exists tagline text;

alter table studios drop constraint if exists studios_slug_format;
alter table studios
  add constraint studios_slug_format check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40);
alter table studios drop constraint if exists studios_tagline_length;
alter table studios
  add constraint studios_tagline_length check (tagline is null or char_length(tagline) <= 160);

create unique index if not exists studios_slug_idx on studios (slug);

-- Give studios created before this a link made from their name (plus a short
-- piece of their id, so two shops with the same name don't collide).
update studios
set slug = left(
      trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')),
      30
    ) || '-' || left(id::text, 4)
where slug is null;


-- ================================================================
-- 20261101_pay_at_shop.sql
-- ================================================================
-- "Book online, pay at the shop" for studio teams, with no-show protection.
-- Run after 20261031_studio_booking_page.sql. Safe to re-run.
--
-- The client saves a card when booking instead of paying. Nothing is
-- charged unless the pro marks them a no-show; then the shop's no-show fee
-- is charged to that card.

alter table studios
  add column if not exists pay_at_shop_enabled boolean not null default false,
  -- Share of the service price charged when a client doesn't show up.
  add column if not exists no_show_fee_percent integer not null default 50;

alter table studios drop constraint if exists studios_no_show_fee_percent_check;
alter table studios
  add constraint studios_no_show_fee_percent_check check (no_show_fee_percent between 0 and 100);

alter table bookings
  add column if not exists stripe_setup_intent_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists no_show_fee_cents integer,
  add column if not exists no_show_status text,
  add column if not exists no_show_at timestamptz,
  add column if not exists stripe_no_show_payment_intent_id text,
  add column if not exists stripe_no_show_transfer_id text;

alter table bookings drop constraint if exists bookings_no_show_status_check;
alter table bookings
  add constraint bookings_no_show_status_check
  check (no_show_status is null or no_show_status in ('charged', 'failed', 'waived'));

-- One booking per saved-card checkout, so a retried confirm can't double book.
create unique index if not exists bookings_setup_intent_idx
  on bookings (stripe_setup_intent_id) where stripe_setup_intent_id is not null;
