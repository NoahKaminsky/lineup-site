-- Prevent double bookings at the database level.
--
-- The app checks for clashes before taking payment and again in the Stripe
-- webhook, but those checks run as separate steps, so two payments landing at
-- almost the same moment could both pass and both insert. This constraint
-- makes that impossible: a professional can never have two active bookings
-- whose times overlap on the same day. The webhook treats the resulting error
-- (23P01) as "slot taken" and refunds the second customer automatically.
--
-- HOW TO APPLY (Supabase dashboard → SQL editor):
--   1. Run the CHECK query below first. If it returns rows, those bookings
--      already overlap — cancel or reschedule them, then re-run until empty.
--   2. Run the rest of this file.

-- 1) CHECK — existing overlaps (should return no rows before step 2).
-- select a.id as booking_a, b.id as booking_b, a.professional_id, a.booking_date,
--        a.start_time as a_start, a.end_time as a_end, b.start_time as b_start, b.end_time as b_end
-- from public.bookings a
-- join public.bookings b
--   on a.professional_id = b.professional_id
--  and a.booking_date = b.booking_date
--  and a.id < b.id
--  and a.status in ('confirmed', 'completion_requested', 'completed')
--  and b.status in ('confirmed', 'completion_requested', 'completed')
--  and a.start_time < b.end_time
--  and a.end_time > b.start_time;

-- 2) CONSTRAINT
create extension if not exists btree_gist;

alter table public.bookings
  add constraint bookings_no_overlapping_times
  exclude using gist (
    professional_id with =,
    tsrange(booking_date + start_time, booking_date + end_time, '[)') with &&
  )
  where (status in ('confirmed', 'completion_requested', 'completed'));
