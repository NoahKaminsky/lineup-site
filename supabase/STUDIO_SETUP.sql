-- LineUp studio features: everything in one file.
-- Supabase dashboard -> SQL Editor -> New query -> paste ALL of this -> Run.
-- Safe to run more than once. Only adds new tables and columns; nothing existing is removed.


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


-- ================================================================
-- 20261102_chairs_and_boosts.sql
-- ================================================================
-- Chair openings and paid boosts. Run after 20261101_pay_at_shop.sql.
-- Safe to re-run.
--
--   chair_openings      a studio posts an open chair; only professionals in
--                       the matching trade can see it (filtered by the server)
--   chair_applications  a pro says they're interested; the studio can invite
--                       them onto the team
--   boosts              paid placement: a pro's profile at the top of Browse,
--                       or a chair opening at the top of the list, for a week

create table if not exists chair_openings (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  posted_by uuid references profiles(id) on delete set null,
  title text not null check (char_length(title) between 3 and 80),
  professions text[] not null check (cardinality(professions) between 1 and 9),
  arrangement text not null default 'either' check (arrangement in ('booth_rent', 'commission', 'either')),
  rent_cents integer check (rent_cents is null or rent_cents between 0 and 1000000),
  rent_interval text check (rent_interval is null or rent_interval in ('week', 'month')),
  commission_note text check (commission_note is null or char_length(commission_note) <= 60),
  description text check (description is null or char_length(description) <= 1500),
  available_from date,
  area_label text,
  lat double precision,
  lng double precision,
  status text not null default 'open' check (status in ('open', 'filled', 'closed')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create index if not exists chair_openings_open_idx on chair_openings (status, expires_at);
create index if not exists chair_openings_studio_idx on chair_openings (studio_id);
create index if not exists chair_openings_professions_idx on chair_openings using gin (professions);

create table if not exists chair_applications (
  id uuid primary key default gen_random_uuid(),
  opening_id uuid not null references chair_openings(id) on delete cascade,
  professional_id uuid not null references profiles(id) on delete cascade,
  message text check (message is null or char_length(message) <= 800),
  status text not null default 'new' check (status in ('new', 'invited', 'declined')),
  created_at timestamptz not null default now(),
  unique (opening_id, professional_id)
);

create index if not exists chair_applications_pro_idx on chair_applications (professional_id);

create table if not exists boosts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('profile', 'chair_opening')),
  -- The profile id or chair opening id being promoted.
  target_id uuid not null,
  purchased_by uuid references profiles(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  amount_cents integer not null default 0,
  stripe_checkout_session_id text unique,
  created_at timestamptz not null default now(),
  constraint boosts_dates check (ends_at > starts_at)
);

create index if not exists boosts_active_idx on boosts (kind, ends_at);

-- Openings and applications go through the server only (it decides who can
-- see which openings). Boosts are public: Browse shows who's promoted.
alter table chair_openings enable row level security;
alter table chair_applications enable row level security;
alter table boosts enable row level security;

drop policy if exists "anyone reads boosts" on boosts;
create policy "anyone reads boosts" on boosts for select to anon, authenticated using (true);


-- ================================================================
-- 20261103_memberships.sql
-- ================================================================
-- Client memberships: a shop sells a monthly membership (e.g. "Unlimited
-- cuts, $60/mo"); clients pay by card every month and the money goes to the
-- shop's payout account, minus LineUp's fee. Staff check members in at each
-- visit. Run after 20261102_chairs_and_boosts.sql. Safe to re-run.

create table if not exists membership_plans (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  description text check (description is null or char_length(description) <= 500),
  price_cents integer not null check (price_cents between 500 and 100000),
  -- Visits included each month; null means unlimited.
  visits_per_period integer check (visits_per_period is null or visits_per_period between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists membership_plans_studio_idx on membership_plans (studio_id);

create table if not exists client_memberships (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references membership_plans(id) on delete cascade,
  studio_id uuid not null references studios(id) on delete cascade,
  customer_id uuid not null references profiles(id) on delete cascade,
  stripe_subscription_id text unique,
  status text not null default 'incomplete',
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists client_memberships_studio_idx on client_memberships (studio_id, status);
create index if not exists client_memberships_customer_idx on client_memberships (customer_id);

create table if not exists membership_visits (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references client_memberships(id) on delete cascade,
  checked_in_by uuid references profiles(id) on delete set null,
  visited_at timestamptz not null default now()
);

create index if not exists membership_visits_membership_idx on membership_visits (membership_id, visited_at);

-- Everything goes through the server (it checks who's the shop and who's
-- the member); no direct access from the browser.
alter table membership_plans enable row level security;
alter table client_memberships enable row level security;
alter table membership_visits enable row level security;
