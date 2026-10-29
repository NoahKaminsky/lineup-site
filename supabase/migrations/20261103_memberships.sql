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
