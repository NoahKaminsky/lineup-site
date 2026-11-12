-- Gift cards for one pro or one shop. The buyer pays the card's value; the
-- money goes straight to that pro's or shop's Stripe account (minus card
-- processing and LineUp's flat fee, taken from the seller, never the buyer:
-- Manitoba doesn't allow fees charged to the gift card holder). The pro or
-- shop takes it off the bill when the holder comes in. Cards never expire.
-- Server-only: read and written with the service key, so no row policies.

create table if not exists gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  professional_id uuid references profiles(id) on delete set null,
  studio_id uuid references studios(id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  balance_cents integer not null check (balance_cents >= 0),
  currency text not null default 'cad',
  -- pending until Stripe says it's paid
  status text not null default 'pending' check (status in ('pending', 'active', 'void')),
  buyer_id uuid references profiles(id) on delete set null,
  buyer_name text,
  buyer_email text,
  recipient_name text,
  recipient_email text,
  message text,
  send_to_recipient boolean not null default true,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  check (professional_id is not null or studio_id is not null)
);

create index if not exists gift_cards_professional_idx on gift_cards (professional_id);
create index if not exists gift_cards_studio_idx on gift_cards (studio_id);

create table if not exists gift_card_redemptions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references gift_cards(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  redeemed_by uuid references profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists gift_card_redemptions_card_idx on gift_card_redemptions (gift_card_id);

alter table gift_cards enable row level security;
alter table gift_card_redemptions enable row level security;

-- Take an amount off a card in one step, so two people redeeming at once
-- can't both spend the same balance. Returns the new balance, or null if the
-- card isn't active or doesn't have enough on it.
create or replace function redeem_gift_card(p_card uuid, p_amount integer, p_by uuid, p_note text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  update gift_cards
     set balance_cents = balance_cents - p_amount
   where id = p_card and status = 'active' and balance_cents >= p_amount and p_amount > 0
  returning balance_cents into new_balance;
  if new_balance is null then
    return null;
  end if;
  insert into gift_card_redemptions (gift_card_id, amount_cents, redeemed_by, note)
  values (p_card, p_amount, p_by, p_note);
  return new_balance;
end;
$$;

revoke all on function redeem_gift_card(uuid, integer, uuid, text) from public, anon, authenticated;
