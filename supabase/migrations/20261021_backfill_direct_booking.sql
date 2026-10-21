-- Every paying professional gets instant booking on, without touching a
-- setting. New and changed subscriptions already do this (Stripe webhook,
-- /admin, and the sync_direct_booking_with_subscription trigger); this
-- catches pros who were already paying before those existed and still have
-- it switched off.
update profiles
set direct_booking_enabled = true,
    public_availability_enabled = true
where subscription_plan in ('apprentice', 'pro', 'master')
  and subscription_status in ('active', 'trialing')
  and (not coalesce(direct_booking_enabled, false)
       or not coalesce(public_availability_enabled, false));
