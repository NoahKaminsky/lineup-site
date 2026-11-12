-- Regular appointments: a client books the same pro, service and time every
-- few weeks. Future visits are held on the pro's calendar so nobody else can
-- take them; a week before each one the client gets a one-tap link to confirm
-- and pay. Unconfirmed two days out, that visit is released. Nothing is ever
-- charged automatically. Server-only (service key), so no row policies.

create table if not exists standing_appointments (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references profiles(id) on delete cascade,
  customer_id uuid not null references profiles(id) on delete cascade,
  service_id uuid references professional_services(id) on delete set null,
  service_name text,
  service_mode text not null,
  start_time time not null,
  end_time time not null,
  interval_weeks integer not null check (interval_weeks between 1 and 8),
  -- The next visit still to happen (held, or already booked).
  next_date date not null,
  -- The visit the client was last sent a reminder for, so it's sent once.
  reminded_for date,
  status text not null default 'active' check (status in ('active', 'ended')),
  source_booking_id uuid references bookings(id) on delete set null,
  ended_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists standing_appointments_pro_idx on standing_appointments (professional_id) where status = 'active';
create index if not exists standing_appointments_customer_idx on standing_appointments (customer_id) where status = 'active';

alter table bookings add column if not exists standing_id uuid references standing_appointments(id) on delete set null;

alter table standing_appointments enable row level security;
