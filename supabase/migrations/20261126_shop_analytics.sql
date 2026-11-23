-- Shop Analytics: alert history (so an alert never repeats inside its
-- window), the opt-in weekly push, chair opening views, and a local shop
-- comparison that only ever returns medians. Run after
-- 20261125_booking_came_from.sql. Safe to re-run.

-- 1. Owners and managers of a shop (the shop's admins).
create or replace function is_studio_manager(target_studio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from studios where id = target_studio and owner_id = auth.uid())
    or exists (
      select 1 from studio_members
      where studio_id = target_studio and profile_id = auth.uid() and status = 'active' and role in ('owner', 'manager')
    );
$$;

-- 2. Weekly push: off by default. time_zone null means America/Winnipeg.
alter table profiles
  add column if not exists weekly_push_opt_in boolean not null default false,
  add column if not exists time_zone text check (time_zone is null or char_length(time_zone) <= 64);

create table if not exists weekly_push_log (
  profile_id uuid not null references profiles(id) on delete cascade,
  week date not null, -- the Monday, in their time zone
  sent_at timestamptz not null default now(),
  primary key (profile_id, week)
);
alter table weekly_push_log enable row level security;
drop policy if exists "people read their own weekly pushes" on weekly_push_log;
create policy "people read their own weekly pushes" on weekly_push_log
  for select to authenticated using (profile_id = auth.uid());

-- 3. Alerts shown on Analytics: a pro's own, or a shop's.
create table if not exists analytics_alerts (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid references profiles(id) on delete cascade,
  studio_id uuid references studios(id) on delete cascade,
  key text not null check (char_length(key) <= 120),
  title text not null check (char_length(title) <= 200),
  body text not null check (char_length(body) <= 400),
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  constraint analytics_alerts_owner check ((professional_id is null) <> (studio_id is null))
);
create index if not exists analytics_alerts_pro on analytics_alerts (professional_id, key, created_at desc) where professional_id is not null;
create index if not exists analytics_alerts_shop on analytics_alerts (studio_id, key, created_at desc) where studio_id is not null;
alter table analytics_alerts enable row level security;
drop policy if exists "owners read their alerts" on analytics_alerts;
create policy "owners read their alerts" on analytics_alerts
  for select to authenticated
  using (professional_id = auth.uid() or (studio_id is not null and is_studio_manager(studio_id)));

-- 4. Chair opening views: one per pro per opening per day.
create table if not exists chair_opening_views (
  opening_id uuid not null references chair_openings(id) on delete cascade,
  viewer_id uuid not null references profiles(id) on delete cascade,
  day date not null default current_date,
  primary key (opening_id, viewer_id, day)
);
alter table chair_opening_views enable row level security;
drop policy if exists "shop managers read views of their openings" on chair_opening_views;
create policy "shop managers read views of their openings" on chair_opening_views
  for select to authenticated
  using (exists (select 1 from chair_openings o where o.id = opening_id and is_studio_manager(o.studio_id)));

-- 5. Local comparison: the median average ticket and rebook rate of other
-- live shops in the same city over the last 90 days. Nothing below 5 shops,
-- never a shop's name or its own figures. Managers of the shop only.
create or replace function local_shop_stats(target_studio uuid)
returns table (shops integer, median_ticket_cents integer, median_rebook integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_city text;
begin
  if not is_studio_manager(target_studio) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select lower(trim(coalesce(area_label, ''))) into my_city from studios where id = target_studio;
  return query
  with others as (
    select s.id from studios s
    where s.id <> target_studio
      and lower(trim(coalesce(s.area_label, ''))) = my_city and my_city <> ''
      and s.subscription_status in ('active', 'trialing')
  ),
  visits as (
    select b.studio_id, b.customer_id::text as client, b.booking_date as d, coalesce(b.service_price, 0) * 100 as cents
    from bookings b join others o on o.id = b.studio_id
    where b.status = 'completed' and b.booking_date >= current_date - 90
    union all
    select a.studio_id, nullif(regexp_replace(coalesce(a.client_phone, ''), '\D', '', 'g'), ''), a.appointment_date, coalesce(a.price_cents, 0)
    from shop_appointments a join others o on o.id = a.studio_id
    where a.status = 'completed' and a.kind <> 'imported' and a.appointment_date >= current_date - 90
  ),
  per_shop as (
    select studio_id,
      avg(cents) filter (where cents > 0) as ticket,
      100.0 * count(distinct client) filter (where client in (select client from visits v2 where v2.studio_id = visits.studio_id group by client having count(*) >= 2))
        / nullif(count(distinct client), 0) as rebook
    from visits group by studio_id
    having count(*) >= 10
  ),
  agg as (
    select count(*)::integer as n,
      round(percentile_cont(0.5) within group (order by ticket))::integer as t,
      round(percentile_cont(0.5) within group (order by rebook))::integer as r
    from per_shop
  )
  select n, case when n >= 5 then t end, case when n >= 5 then r end from agg;
end;
$$;
revoke all on function local_shop_stats(uuid) from public, anon;
grant execute on function local_shop_stats(uuid) to authenticated;
