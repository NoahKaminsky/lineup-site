-- Saving a shop's imported calendar: one tidy client list matched by phone
-- or email, clients linked to the pros they've seen, imported appointments
-- linked to their client, and imports that save in chunks and can be
-- rolled back. Run after 20261117_import_batches.sql. Safe to re-run.

-- 1. Clients ------------------------------------------------------------------
-- Plenty of booking apps only have a phone number for a client, so email is
-- no longer required. Phones are stored normalised (+1 and ten digits) so the
-- same person is found however the number was typed.
alter table studio_clients alter column email drop not null;
alter table studio_clients
  add column if not exists phone_norm text,
  add column if not exists updated_at timestamptz not null default now(),
  -- Set when someone at the shop changes this client by hand; an import's
  -- Undo leaves edited clients alone.
  add column if not exists edited_at timestamptz;

alter table studio_clients drop constraint if exists studio_clients_phone_norm_check;
alter table studio_clients add constraint studio_clients_phone_norm_check
  check (phone_norm is null or phone_norm ~ '^\+1[2-9][0-9]{9}$');
alter table studio_clients drop constraint if exists studio_clients_contact_check;
alter table studio_clients add constraint studio_clients_contact_check
  check (email is not null or phone_norm is not null or name is not null);

-- One client per phone number in a shop's list (and in a solo pro's list).
create unique index if not exists studio_clients_studio_phone_key
  on studio_clients (studio_id, phone_norm) where studio_id is not null and phone_norm is not null;
create unique index if not exists studio_clients_pro_phone_key
  on studio_clients (professional_id, phone_norm) where professional_id is not null and phone_norm is not null;
create index if not exists studio_clients_studio_name on studio_clients (studio_id, lower(name)) where studio_id is not null;

-- 2. Which pros each client has seen -----------------------------------------
create table if not exists studio_client_pros (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references studio_clients(id) on delete cascade,
  professional_id uuid not null references profiles(id) on delete cascade,
  studio_id uuid references studios(id) on delete cascade,
  first_seen date,
  last_seen date,
  visits integer not null default 0 check (visits >= 0),
  -- The import that first made this link (Undo removes links it made).
  import_batch_id uuid references import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (client_id, professional_id)
);
create index if not exists studio_client_pros_pro on studio_client_pros (professional_id);
create index if not exists studio_client_pros_batch on studio_client_pros (import_batch_id) where import_batch_id is not null;

alter table studio_client_pros enable row level security;
drop policy if exists "pros and shop managers read client links" on studio_client_pros;
create policy "pros and shop managers read client links" on studio_client_pros
  for select to authenticated
  using (professional_id = auth.uid() or (studio_id is not null and is_studio_manager(studio_id)));
-- No write policies: only the server changes these.

-- 3. Imported appointments ----------------------------------------------------
alter table shop_appointments
  add column if not exists studio_client_id uuid references studio_clients(id) on delete set null;
create index if not exists shop_appointments_client on shop_appointments (studio_client_id) where studio_client_id is not null;

-- The same imported appointment is only ever saved once, so importing a
-- file twice adds nothing the second time.
create unique index if not exists shop_appointments_imported_once
  on shop_appointments (professional_id, appointment_date, start_time, end_time) where kind = 'imported';

-- 4. Batches that save in chunks ---------------------------------------------
alter table import_batches
  add column if not exists status text not null default 'done',
  add column if not exists summary jsonb not null default '{}'::jsonb,
  add column if not exists finished_at timestamptz;
alter table import_batches drop constraint if exists import_batches_status_check;
alter table import_batches add constraint import_batches_status_check check (status in ('saving', 'done', 'failed'));
