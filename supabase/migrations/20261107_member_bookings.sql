-- A booking made by a member is covered by their membership: the pro and
-- the front desk see "Member" instead of a price to collect. Safe to re-run.

alter table bookings
  add column if not exists membership_id uuid references client_memberships(id) on delete set null;
