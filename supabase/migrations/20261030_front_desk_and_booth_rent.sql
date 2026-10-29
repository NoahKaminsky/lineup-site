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
