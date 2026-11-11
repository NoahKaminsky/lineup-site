-- Clients can save (heart) the pros they like, so they're one tap away on
-- their account page. Until this runs, the heart simply doesn't appear.

create table if not exists saved_pros (
  client_id uuid not null references profiles(id) on delete cascade,
  professional_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, professional_id)
);

alter table saved_pros enable row level security;

-- A client's saved list is private to them: only they can read, add or remove.
drop policy if exists "clients manage own saved pros" on saved_pros;
create policy "clients manage own saved pros"
  on saved_pros for all
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);
