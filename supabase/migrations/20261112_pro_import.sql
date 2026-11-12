-- Pros bring their book over from another app: their client list and their
-- upcoming appointments. Any pro on a paid plan can, not just shops.
--
-- Imported appointments live with the front desk's walk-ins and phone-ins
-- (shop_appointments, kind 'imported'), so they already block the pro's
-- calendar, booking page and calendar feed, and the no-overlap rule stops
-- two landing on the same time. A solo pro's have no shop.
alter table shop_appointments alter column studio_id drop not null;
alter table shop_appointments drop constraint if exists shop_appointments_kind_check;
alter table shop_appointments add constraint shop_appointments_kind_check check (kind in ('walk_in', 'phone', 'imported'));

-- A client list can belong to a shop or to one pro.
alter table studio_clients alter column studio_id drop not null;
alter table studio_clients add column if not exists professional_id uuid references profiles(id) on delete cascade;
alter table studio_clients drop constraint if exists studio_clients_owner_check;
alter table studio_clients add constraint studio_clients_owner_check check (studio_id is not null or professional_id is not null);
-- Not partial: shop rows have no professional_id, and nulls never clash.
create unique index if not exists studio_clients_pro_email_key on studio_clients (professional_id, email);
create index if not exists studio_clients_pro_idx on studio_clients (professional_id) where professional_id is not null;
