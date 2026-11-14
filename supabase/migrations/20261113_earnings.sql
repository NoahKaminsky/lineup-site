-- Earnings report. Walk-ins, phone-ins and imported appointments are paid at
-- the shop, outside LineUp, so the front desk records how the client paid and
-- any tip when it marks one done. The earnings report reads these.
alter table shop_appointments
  add column if not exists paid_with text,
  add column if not exists tip_cents integer not null default 0;

alter table shop_appointments drop constraint if exists shop_appointments_paid_with_check;
alter table shop_appointments
  add constraint shop_appointments_paid_with_check check (paid_with is null or paid_with in ('cash', 'card', 'etransfer', 'other'));

alter table shop_appointments drop constraint if exists shop_appointments_tip_check;
alter table shop_appointments
  add constraint shop_appointments_tip_check check (tip_cents between 0 and 1000000);

create index if not exists bookings_pro_date on bookings (professional_id, booking_date);
create index if not exists bookings_studio_date on bookings (studio_id, booking_date) where studio_id is not null;
