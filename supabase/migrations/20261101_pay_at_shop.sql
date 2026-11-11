-- "Book online, pay at the shop" for studio teams, with no-show protection.
-- Run after 20261031_studio_booking_page.sql. Safe to re-run.
--
-- The client saves a card when booking instead of paying. Nothing is
-- charged unless the pro marks them a no-show; then the shop's no-show fee
-- is charged to that card.

alter table studios
  add column if not exists pay_at_shop_enabled boolean not null default false,
  -- Share of the service price charged when a client doesn't show up.
  add column if not exists no_show_fee_percent integer not null default 50;

alter table studios drop constraint if exists studios_no_show_fee_percent_check;
alter table studios
  add constraint studios_no_show_fee_percent_check check (no_show_fee_percent between 0 and 100);

alter table bookings
  add column if not exists stripe_setup_intent_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists no_show_fee_cents integer,
  add column if not exists no_show_status text,
  add column if not exists no_show_at timestamptz,
  add column if not exists stripe_no_show_payment_intent_id text,
  add column if not exists stripe_no_show_transfer_id text;

alter table bookings drop constraint if exists bookings_no_show_status_check;
alter table bookings
  add constraint bookings_no_show_status_check
  check (no_show_status is null or no_show_status in ('charged', 'failed', 'waived'));

-- One booking per saved-card checkout, so a retried confirm can't double book.
create unique index if not exists bookings_setup_intent_idx
  on bookings (stripe_setup_intent_id) where stripe_setup_intent_id is not null;
