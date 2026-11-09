-- Spotlight: the paid placement at the top of Explore. Each time a pro's
-- Spotlight card is shown or tapped we log one row, so pros can see what
-- their plan or boost actually did ("142 views, 9 taps this week").
-- Written only by the server (/api/spotlight); pros read their own counts
-- through the same route.

create table if not exists spotlight_events (
  id bigint generated always as identity primary key,
  professional_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('view', 'tap')),
  surface text not null default 'explore',
  viewer_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists spotlight_events_pro_time
  on spotlight_events (professional_id, created_at desc);

alter table spotlight_events enable row level security;
-- No policies: only the service role (server routes) reads or writes.
