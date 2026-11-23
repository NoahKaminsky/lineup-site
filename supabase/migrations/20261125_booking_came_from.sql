-- Where a booking came from, stamped when it's saved, so the payment code
-- doesn't change. Run after 20261124_pro_analytics.sql. Safe to re-run.
--
-- A profile visit records how the client found the pro (app/lib/bookingSource.ts).
-- A new booking takes: a request -> 'request'; a regular appointment ->
-- 'regular'; paid with a gift card -> 'gift_card'; otherwise how that
-- client most recently found this pro in the last 14 days, if known.

alter table spotlight_events
  add column if not exists via text check (via is null or via in ('spotlight', 'boost', 'discover', 'referral', 'booking_link'));

create index if not exists spotlight_events_profile_visits
  on spotlight_events (professional_id, viewer_id, created_at desc)
  where surface = 'profile';

create or replace function stamp_booking_came_from()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.came_from is null then
    new.came_from := case
      when new.source = 'request' then 'request'
      when new.standing_id is not null then 'regular'
      when new.gift_card_id is not null then 'gift_card'
      else (
        select e.via from spotlight_events e
        where e.surface = 'profile'
          and e.professional_id = new.professional_id
          and e.viewer_id = new.customer_id
          and e.via is not null
          and e.created_at >= now() - interval '14 days'
        order by e.created_at desc
        limit 1
      )
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_came_from on bookings;
create trigger bookings_came_from
  before insert on bookings
  for each row execute function stamp_booking_came_from();
