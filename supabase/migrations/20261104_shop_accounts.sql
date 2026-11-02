-- Shop accounts. Run after 20261103_memberships.sql. Safe to re-run.
--
-- A shop owner no longer needs to be a professional:
--   profiles.role            can be 'shop' for an owner who runs the shop
--                            but doesn't take clients themselves
--   studio_members.takes_clients
--                            false = not bookable: no calendar column, not on
--                            the booking page, doesn't count toward the 2 pros
--   studio_members.solo_plan_handled
--                            set once we've stopped a pro's own paid plan
--                            renewing because the studio now covers them
--   studios.address / lat / lng / area_label / trades
--                            the shop's own location and what it offers, used
--                            for chair openings and requests near the shop
--   studio_request_passes    a manager passed a client request to a pro

alter table studio_members
  add column if not exists takes_clients boolean not null default true,
  add column if not exists solo_plan_handled boolean not null default false;

alter table studios
  add column if not exists address text,
  add column if not exists place_id text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists area_label text,
  add column if not exists trades text[] not null default '{}';

create table if not exists studio_request_passes (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  request_id uuid not null,
  professional_id uuid not null references profiles(id) on delete cascade,
  passed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (studio_id, request_id, professional_id)
);

create index if not exists studio_request_passes_studio_idx on studio_request_passes (studio_id, created_at desc);

-- Server only.
alter table studio_request_passes enable row level security;

-- If profiles.role has a check constraint listing the allowed roles, add
-- 'shop' to it. (Projects without one are left alone.)
do $$
declare
  c record;
begin
  for c in
    select con.conname, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'profiles'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%role%'
      and pg_get_constraintdef(con.oid) ilike '%professional%'
      and pg_get_constraintdef(con.oid) not ilike '%''shop''%'
  loop
    execute format('alter table profiles drop constraint %I', c.conname);
    execute format(
      'alter table profiles add constraint %I check (role is null or role in (''customer'', ''professional'', ''shop'', ''I am a customer'', ''I am a professional''))',
      c.conname
    );
  end loop;
end $$;
