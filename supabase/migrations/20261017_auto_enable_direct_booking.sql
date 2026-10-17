-- Turn the instant-booking calendar on (and off) with the subscription,
-- however the subscription gets set.
--
-- Stripe checkout (webhook) and /admin already do this in app code, but a
-- plan edited directly in the Supabase table editor skipped it, leaving a
-- paying pro with no calendar on their profile. This trigger covers every
-- path at the database level.
--
-- It only reacts to a CHANGE between "live" and "not live" (live = a paid
-- plan with status active or trialing). So a pro who deliberately turns
-- direct booking off in Services keeps it off; renewals and other updates
-- leave their choice alone.

create or replace function sync_direct_booking_with_subscription()
returns trigger
language plpgsql
as $$
declare
  was_live boolean := coalesce(old.subscription_plan, '') in ('apprentice', 'pro', 'master')
                      and coalesce(old.subscription_status, '') in ('active', 'trialing');
  is_live boolean := coalesce(new.subscription_plan, '') in ('apprentice', 'pro', 'master')
                     and coalesce(new.subscription_status, '') in ('active', 'trialing');
begin
  if is_live and not was_live then
    new.direct_booking_enabled := true;
    new.public_availability_enabled := true;
  elsif was_live and not is_live then
    new.direct_booking_enabled := false;
    new.public_availability_enabled := false;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_direct_booking_with_subscription on profiles;
create trigger sync_direct_booking_with_subscription
  before update of subscription_plan, subscription_status on profiles
  for each row
  execute function sync_direct_booking_with_subscription();

-- One-time fix for the account that was upgraded by hand before this
-- trigger existed (already live, so the trigger alone won't flip it).
update profiles
set direct_booking_enabled = true,
    public_availability_enabled = true
where email = 'lineupmb@gmail.com'
  and subscription_plan in ('apprentice', 'pro', 'master')
  and subscription_status in ('active', 'trialing');
