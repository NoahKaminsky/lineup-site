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
