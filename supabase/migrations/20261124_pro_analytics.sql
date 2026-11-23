-- Pro Analytics: where each booking came from, a revenue or bookings goal,
-- daily rollups so each section loads fast, and local price comparisons
-- that only ever return averages. Run after 20261123_tax_year.sql. Safe to re-run.

-- 1. Where a booking came from ----------------------------------------------
-- Separate from bookings.source ("direct_booking" / "request"), which
-- decides commission and is never touched here. Recorded from now on;
-- older bookings stay null and show as "Not tracked".
alter table bookings
  add column if not exists came_from text check (
    came_from is null or came_from in ('booking_link', 'discover', 'spotlight', 'boost', 'referral', 'gift_card', 'request', 'regular')
  );

-- 2. Goals --------------------------------------------------------------------
-- sales_goal_cents stays the revenue goal; a pro can pick bookings instead.
alter table profiles
  add column if not exists goal_kind text not null default 'revenue' check (goal_kind in ('revenue', 'bookings')),
  add column if not exists goal_bookings integer check (goal_bookings is null or (goal_bookings > 0 and goal_bookings <= 2000));

-- 3. Daily rollups ------------------------------------------------------------
-- One row per pro per day, worked out by the nightly cron
-- (/api/cron/analytics-rollup) with the same earnings code as the Earnings
-- page, so the two never disagree. Imported appointments count as booked
-- minutes, never revenue.
create table if not exists analytics_daily (
  professional_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  revenue_cents integer not null default 0,
  bookings integer not null default 0,
  booked_minutes integer not null default 0,
  imported_minutes integer not null default 0,
  no_shows integer not null default 0,
  late_cancels integer not null default 0,
  new_clients integer not null default 0,
  computed_at timestamptz not null default now(),
  primary key (professional_id, day)
);
alter table analytics_daily enable row level security;
drop policy if exists "pros read their own rollups" on analytics_daily;
create policy "pros read their own rollups" on analytics_daily
  for select to authenticated
  using (professional_id = auth.uid());
-- Writes come only from the server (the cron).

-- 4. Local prices ---------------------------------------------------------------
-- For the signed-in pro: the median and range other pros in the same trade
-- and city charge for a service with the same name. Never a name, never a
-- single price, and nothing at all below 5 other pros.
create or replace function local_service_prices(service text)
returns table (pros integer, median_cents integer, low_cents integer, high_cents integer)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, lower(trim(city)) as city, professional_type
    from profiles where id = auth.uid()
  ),
  prices as (
    select distinct on (s.professional_id) round(s.price * 100)::integer as cents
    from professional_services s
    join profiles p on p.id = s.professional_id
    join me on true
    where s.professional_id <> me.id
      and s.is_active is not false
      and s.price > 0
      and lower(trim(s.service_name)) = lower(trim(service))
      and lower(trim(p.city)) = me.city
      and p.professional_type = me.professional_type
    order by s.professional_id, s.price
  ),
  agg as (
    select count(*)::integer as n,
      round(percentile_cont(0.5) within group (order by cents))::integer as med,
      percentile_disc(0.1) within group (order by cents) as lo,
      percentile_disc(0.9) within group (order by cents) as hi
    from prices
  )
  select n,
    case when n >= 5 then med end,
    case when n >= 5 then lo end,
    case when n >= 5 then hi end
  from agg;
$$;
revoke all on function local_service_prices(text) from public, anon;
grant execute on function local_service_prices(text) to authenticated;
