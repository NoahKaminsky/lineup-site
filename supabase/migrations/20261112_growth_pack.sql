-- Four small features.

-- 1. Rebooking nudge: a few weeks after a completed booking, if the client
--    hasn't booked that pro again, they get one "book your next one?" nudge.
alter table bookings add column if not exists rebook_nudge_sent_at timestamptz;

-- 2. Client notes: a pro's private notes on a client ("a 2 on the sides",
--    formulas, allergies). Only that pro can read or write them.
create table if not exists pro_client_notes (
  professional_id uuid not null references profiles(id) on delete cascade,
  customer_id uuid not null references profiles(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (professional_id, customer_id)
);
alter table pro_client_notes enable row level security;
drop policy if exists "pros manage own client notes" on pro_client_notes;
create policy "pros manage own client notes"
  on pro_client_notes for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);

-- 3. Pro referrals: "bring a pro, get a free month". A pro who signs up
--    through another pro's link and starts a paid plan earns the referrer a
--    month's credit on their LineUp subscription.
alter table profiles add column if not exists referral_code text unique;
alter table profiles add column if not exists referred_by uuid references profiles(id) on delete set null;
create table if not exists referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  referred_id uuid not null unique references profiles(id) on delete cascade,
  amount_cents integer,
  status text not null default 'pending' check (status in ('pending', 'applied')),
  stripe_balance_transaction_id text,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
alter table referral_rewards enable row level security;

-- 4. Replies to reviews: the pro's public answer under a review.
alter table professional_reviews add column if not exists pro_reply text check (pro_reply is null or char_length(pro_reply) <= 1000);
alter table professional_reviews add column if not exists pro_replied_at timestamptz;
