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
