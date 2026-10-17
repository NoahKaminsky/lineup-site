-- Security hardening: stop users editing fields that grant trust, money or
-- admin powers, even if they call the database directly with their own login.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Why: the app writes to `profiles` from the browser (name, bio, settings),
-- so a row-level "users can update their own profile" rule also lets a user
-- send { is_admin: true } or { subscription_plan: 'master' } for their own
-- row. Same idea for bookings, whose payout amounts decide how much money
-- Stripe sends a professional. The server (service role) is unaffected.

-- 1. Profiles: admin, featured, subscription and Stripe fields are server-only.
create or replace function protect_profile_privileged_fields()
returns trigger
language plpgsql
as $$
declare
  col text;
  locked text[] := array[
    'is_admin',
    'is_featured',
    'is_founding_artist',
    'subscription_plan',
    'subscription_status',
    'subscription_current_period_end',
    'stripe_customer_id',
    'stripe_subscription_id',
    'stripe_account_id',
    'stripe_onboarding_complete',
    'stripe_charges_enabled',
    'stripe_payouts_enabled'
  ];
  new_json jsonb := to_jsonb(new);
  old_json jsonb;
begin
  -- The SQL editor and server-side (service role) calls are trusted.
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A brand-new profile can't start out as an admin, featured, paid or
    -- linked to someone else's Stripe account.
    if coalesce((new_json ->> 'is_admin')::boolean, false)
       or coalesce((new_json ->> 'is_featured')::boolean, false)
       or coalesce((new_json ->> 'is_founding_artist')::boolean, false)
       -- Only paid plans are blocked: a column default like 'basic' is fine.
       or coalesce(new_json ->> 'subscription_plan', '') in ('apprentice', 'pro', 'master')
       or new_json ->> 'stripe_customer_id' is not null
       or new_json ->> 'stripe_subscription_id' is not null
       or new_json ->> 'stripe_account_id' is not null then
      raise exception 'Those profile fields can only be set by LineUp.';
    end if;
    return new;
  end if;

  old_json := to_jsonb(old);
  foreach col in array locked loop
    if (new_json -> col) is distinct from (old_json -> col) then
      raise exception 'The % field can only be changed by LineUp.', col;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_fields on profiles;
create trigger protect_profile_privileged_fields
  before insert or update on profiles
  for each row execute function protect_profile_privileged_fields();

-- 2. Bookings: only the server creates, changes or deletes them. (The app
--    never writes bookings from the browser; payment, completion and
--    cancellation all go through API routes that check who's asking.)
create or replace function bookings_server_only()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return coalesce(new, old);
  end if;
  raise exception 'Bookings can only be changed by LineUp.';
end;
$$;

drop trigger if exists bookings_server_only on bookings;
create trigger bookings_server_only
  before insert or update or delete on bookings
  for each row execute function bookings_server_only();

-- 3. Verification documents bucket must stay private.
update storage.buckets set public = false where id = 'verification-documents';


-- ---------------------------------------------------------------------------
-- CHECK-UP (read-only). Run these after the above and look at the results:
--
-- a) Every table should say rls_enabled = true. Any "false" means anyone with
--    the public anon key can read and write that whole table.
--
--   select relname as table_name, relrowsecurity as rls_enabled
--   from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r'
--   order by relrowsecurity, relname;
--
-- b) The rules on each table. Look for policies whose "qual" is just "true"
--    on tables holding private data (bookings, booking_messages,
--    notifications, push_subscriptions, lineup_signups, profiles).
--
--   select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename, cmd;
-- ---------------------------------------------------------------------------
