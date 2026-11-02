-- A shop's pros show the shop's address. Run after 20261104_shop_accounts.sql.
-- Safe to re-run.
--
--   profiles.location_source   'studio' while a pro's public address is their
--                              shop's (kept in step by the server)
--   professional_home_base     private, per pro: a home base for mobile
--                              (at-home) work, never shown to clients; and the
--                              address they had before joining a shop, put
--                              back if they leave

alter table profiles
  add column if not exists location_source text;

create table if not exists professional_home_base (
  profile_id uuid primary key references profiles(id) on delete cascade,
  address text,
  place_id text,
  lat double precision,
  lng double precision,
  own_address text,
  own_place_id text,
  own_lat double precision,
  own_lng double precision,
  updated_at timestamptz not null default now()
);

alter table professional_home_base enable row level security;

-- Each pro can read and edit only their own row.
drop policy if exists "own home base: read" on professional_home_base;
create policy "own home base: read" on professional_home_base
  for select to authenticated using (auth.uid() = profile_id);

drop policy if exists "own home base: add" on professional_home_base;
create policy "own home base: add" on professional_home_base
  for insert to authenticated with check (auth.uid() = profile_id);

drop policy if exists "own home base: edit" on professional_home_base;
create policy "own home base: edit" on professional_home_base
  for update to authenticated using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
