-- Gift cards at online checkout. A client applies a card bought for that pro
-- in the payment sheet; it comes off the charge (the pro already received the
-- card's money when it sold). The card is only drawn down once the payment
-- succeeds, exactly once per payment, and put back if the booking is cancelled.

alter table bookings add column if not exists gift_card_id uuid references gift_cards(id) on delete set null;
alter table bookings add column if not exists gift_card_cents integer not null default 0;

alter table gift_card_redemptions add column if not exists payment_intent_id text unique;
alter table gift_card_redemptions add column if not exists booking_id uuid references bookings(id) on delete set null;
alter table gift_card_redemptions add column if not exists reversed_at timestamptz;

-- Draw a card down for one payment. Running it again for the same payment
-- (Stripe retries webhooks) changes nothing and reports success. Returns the
-- new balance, or null if the card can't cover it any more.
create or replace function redeem_gift_card_for_payment(p_card uuid, p_amount integer, p_by uuid, p_payment_intent text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if exists (select 1 from gift_card_redemptions where payment_intent_id = p_payment_intent) then
    select balance_cents into new_balance from gift_cards where id = p_card;
    return new_balance;
  end if;
  update gift_cards
     set balance_cents = balance_cents - p_amount
   where id = p_card and status = 'active' and balance_cents >= p_amount and p_amount > 0
  returning balance_cents into new_balance;
  if new_balance is null then
    return null;
  end if;
  insert into gift_card_redemptions (gift_card_id, amount_cents, redeemed_by, note, payment_intent_id)
  values (p_card, p_amount, p_by, 'Online booking', p_payment_intent);
  return new_balance;
end;
$$;

-- Put a payment's amount back on its card (booking cancelled or refunded).
-- Only once per payment. Returns the amount put back (0 if nothing to do).
create or replace function restore_gift_card_for_payment(p_payment_intent text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  update gift_card_redemptions
     set reversed_at = now()
   where payment_intent_id = p_payment_intent and reversed_at is null
  returning gift_card_id, amount_cents into r;
  if not found then
    return 0;
  end if;
  update gift_cards set balance_cents = balance_cents + r.amount_cents where id = r.gift_card_id;
  return r.amount_cents;
end;
$$;

revoke all on function redeem_gift_card_for_payment(uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function restore_gift_card_for_payment(text) from public, anon, authenticated;
