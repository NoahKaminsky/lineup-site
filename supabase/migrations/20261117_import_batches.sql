-- Import batches: every upload of appointments or clients from another
-- booking app is recorded as one batch, so a shop (or a solo pro) can see
-- what came in and undo a whole import at once.
--
-- Imported appointments stay in shop_appointments (kind 'imported'), where
-- they already block the pro's calendar and never touch bookings, Stripe,
-- reminders, reviews or plan limits. This adds the batch they came from.
-- Safe to re-run.

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  -- The shop the import is for (null for a solo pro's own import).
  studio_id uuid references studios(id) on delete cascade,
  -- Whose calendar the appointments go on. Null for a shop's client list.
  professional_id uuid references profiles(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('appointments', 'clients')),
  source_type text not null default 'csv' check (source_type in ('csv', 'ics')),
  source_app text not null default 'other' check (source_app in ('squire', 'booksy', 'fresha', 'vagaro', 'square', 'google', 'apple', 'other')),
  file_names text[] not null default '{}' check (cardinality(file_names) <= 20),
  row_count integer not null default 0 check (row_count >= 0),
  added_count integer not null default 0 check (added_count >= 0),
  skipped_past integer not null default 0 check (skipped_past >= 0),
  clash_count integer not null default 0 check (clash_count >= 0),
  problem_count integer not null default 0 check (problem_count >= 0),
  -- Undo: rows still untouched are removed; anything already marked done or
  -- already emailed is kept, and kept_count says how many.
  undone_at timestamptz,
  undone_by uuid references profiles(id) on delete set null,
  kept_count integer not null default 0 check (kept_count >= 0),
  constraint import_batches_owner_check check (studio_id is not null or professional_id is not null)
);

create index if not exists import_batches_studio_time on import_batches (studio_id, created_at desc) where studio_id is not null;
create index if not exists import_batches_pro_time on import_batches (professional_id, created_at desc) where professional_id is not null;

alter table shop_appointments
  add column if not exists import_batch_id uuid references import_batches(id) on delete set null;
create index if not exists shop_appointments_import_batch on shop_appointments (import_batch_id) where import_batch_id is not null;

alter table studio_clients
  add column if not exists import_batch_id uuid references import_batches(id) on delete set null;
create index if not exists studio_clients_import_batch on studio_clients (import_batch_id) where import_batch_id is not null;

-- Who can read what. Writes go through the server only (no write policies).
-- A pro reads the batches for their own calendar; a shop's owner and
-- managers read their shop's; customers and other shops read nothing.
alter table import_batches enable row level security;

drop policy if exists "pros and shop managers read import batches" on import_batches;
create policy "pros and shop managers read import batches" on import_batches
  for select to authenticated
  using (
    professional_id = auth.uid()
    or (studio_id is not null and is_studio_manager(studio_id))
  );

-- shop_appointments already has "pros and managers read front desk" (the pro
-- on the appointment, or the owner/managers of its shop), which covers the
-- imported rows. studio_clients has no policies: server only.
