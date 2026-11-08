-- Remembers that someone has seen the welcome tour, across browsers and
-- devices, so it shows once per person. Safe to re-run.

alter table profiles
  add column if not exists welcome_tour_seen_professional boolean not null default false,
  add column if not exists welcome_tour_seen_customer boolean not null default false;
