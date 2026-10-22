-- Promo code redemptions (e.g. the REELS code from the Instagram reel).
-- One row per client per code once their discounted booking is paid, so a
-- client can only use a once-per-customer code a single time.
-- Only the server (service role) reads or writes this table.
-- Safe to run more than once.

create table if not exists promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  customer_id uuid not null references profiles(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,
  stripe_payment_intent_id text,
  discount_cents integer not null default 0,
  created_at timestamptz not null default now(),
  constraint promo_redemptions_once_per_customer unique (code, customer_id)
);

create index if not exists promo_redemptions_code on promo_redemptions (code);

alter table promo_redemptions enable row level security;
-- No policies: clients can't read or write it directly.
