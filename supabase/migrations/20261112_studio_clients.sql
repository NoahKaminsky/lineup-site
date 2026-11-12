-- A shop's own client list, imported by the owner (or a manager) so they can
-- invite their regulars to book on LineUp. Server-only: the API reads and
-- writes this with the service key, so there are no row policies and nobody
-- can reach it from the browser.

create table if not exists studio_clients (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  name text,
  email text not null,
  phone text,
  added_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- The one invite each client can get (see /api/studio/clients).
  invited_at timestamptz,
  invite_count integer not null default 0,
  -- Clicking unsubscribe in a shop's email stops that shop's emails only.
  unsubscribe_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  unsubscribed_at timestamptz,
  unique (studio_id, email)
);

create index if not exists studio_clients_studio_idx on studio_clients (studio_id);

alter table studio_clients enable row level security;
