-- Professional credential verification.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

-- 1. Aggregate status on profiles (what Browse / gates filter on).
alter table profiles add column if not exists verification_status text not null default 'unverified';
alter table profiles add column if not exists verification_track text;
alter table profiles add column if not exists verified_at timestamptz;
alter table profiles add column if not exists verified_until date;

alter table profiles drop constraint if exists profiles_verification_status_check;
alter table profiles add constraint profiles_verification_status_check
  check (verification_status in ('unverified', 'pending', 'verified', 'rejected', 'expired'));

alter table profiles drop constraint if exists profiles_verification_track_check;
alter table profiles add constraint profiles_verification_track_check
  check (verification_track is null or verification_track in ('licensed', 'student'));

create index if not exists profiles_verification_status_idx on profiles (verification_status);

-- 2. Submitted credentials. Written only by the server (service role); a
--    professional can read their own rows but never write or edit them.
create table if not exists professional_verifications (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references profiles(id) on delete cascade,
  track text not null check (track in ('licensed', 'student')),
  profession_type text not null,
  jurisdiction text,
  license_number text,
  issuing_body text,
  license_expiry date,
  school_name text,
  enrollment_end_date date,
  document_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  admin_note text,
  is_manual boolean not null default false,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists professional_verifications_professional_idx on professional_verifications (professional_id);
create index if not exists professional_verifications_status_idx on professional_verifications (status);

alter table professional_verifications enable row level security;

drop policy if exists "professionals read own verifications" on professional_verifications;
create policy "professionals read own verifications"
  on professional_verifications for select
  using (auth.uid() = professional_id);

-- 3. Stop anyone but the server from setting their own verification fields.
--    (Profile updates happen client-side all over the app, so a column that
--    grants trust can't be left writable.)
create or replace function protect_profile_verification_fields()
returns trigger
language plpgsql
as $$
begin
  -- The SQL editor and server-side (service role) calls are trusted.
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.verification_status := 'unverified';
    new.verification_track := null;
    new.verified_at := null;
    new.verified_until := null;
    return new;
  end if;

  if new.verification_status is distinct from old.verification_status
     or new.verification_track is distinct from old.verification_track
     or new.verified_at is distinct from old.verified_at
     or new.verified_until is distinct from old.verified_until then
    raise exception 'Verification fields can only be changed by LineUp.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_verification_fields on profiles;
create trigger protect_profile_verification_fields
  before insert or update on profiles
  for each row execute function protect_profile_verification_fields();

-- 4. Server-side enforcement: an unverified professional can't send offers,
--    even by calling the API directly.
create or replace function require_verified_professional_for_offers()
returns trigger
language plpgsql
as $$
declare
  v_status text;
  v_until date;
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;

  -- Only gate the professional creating or reviving a live offer. Customers
  -- accepting/declining, and a professional withdrawing their own offer, must
  -- keep working even if verification has lapsed.
  if tg_op = 'UPDATE' and (
       auth.uid() is distinct from new.professional_id
       or new.status not in ('pending', 'payment_pending')
     ) then
    return new;
  end if;

  select verification_status, verified_until
    into v_status, v_until
    from profiles
    where id = new.professional_id;

  if v_status is distinct from 'verified' or (v_until is not null and v_until < current_date) then
    raise exception 'Your account must be verified before you can send offers.';
  end if;

  return new;
end;
$$;

drop trigger if exists require_verified_professional_for_offers on request_offers;
create trigger require_verified_professional_for_offers
  before insert or update on request_offers
  for each row execute function require_verified_professional_for_offers();

-- 5. AFTER running this, existing professionals default to 'unverified' and
--    disappear from Browse until approved. Approve the real ones from
--    Admin -> Verification, or in bulk here (replace the ids):
--
-- update profiles
--   set verification_status = 'verified', verified_at = now()
--   where id in ('<uuid>', '<uuid>');
