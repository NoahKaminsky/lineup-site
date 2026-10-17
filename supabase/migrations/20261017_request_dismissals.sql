-- Professionals can dismiss an open request they don't want to respond to,
-- clearing it from their dashboard and Work lists on every device.
-- (Until this runs, dismissals are kept per device in localStorage.)

create table if not exists request_dismissals (
  professional_id uuid not null references profiles(id) on delete cascade,
  request_id uuid not null references service_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (professional_id, request_id)
);

alter table request_dismissals enable row level security;

drop policy if exists "pros manage own dismissals" on request_dismissals;
create policy "pros manage own dismissals"
  on request_dismissals for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);
