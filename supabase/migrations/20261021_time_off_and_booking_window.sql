-- Scheduling controls for professionals:
--   1. How far ahead clients can book (profiles.booking_window_days).
--      Empty means the default of 8 weeks.
--   2. Time off: date ranges a pro is away, without touching their weekly
--      hours. Clients see no open times on those days.
-- Safe to run more than once.

alter table profiles
  add column if not exists booking_window_days integer;

alter table profiles
  drop constraint if exists profiles_booking_window_days_check;
alter table profiles
  add constraint profiles_booking_window_days_check
  check (booking_window_days is null or booking_window_days between 1 and 56);

create table if not exists professional_time_off (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint professional_time_off_dates check (end_date >= start_date)
);

create index if not exists professional_time_off_pro_dates
  on professional_time_off (professional_id, end_date);

alter table professional_time_off enable row level security;

-- Pros manage their own time off. Clients never read it directly: the
-- server only shares which days are unavailable.
drop policy if exists "pros manage own time off" on professional_time_off;
create policy "pros manage own time off" on professional_time_off
  for all to authenticated
  using (professional_id = auth.uid())
  with check (professional_id = auth.uid());
