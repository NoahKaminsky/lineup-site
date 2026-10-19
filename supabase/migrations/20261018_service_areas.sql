-- Service areas: professionals only hear about (and see) requests inside
-- their area, so a Winnipeg pro isn't offered a Regina request.
--
-- profiles.service_radius_km: how far from their base (the location saved
-- in Services) they'll go. NULL = anywhere. Existing pros start at 50 km.
-- service_requests.area_*: an approximate point (rounded to ~1 km) and a
-- city-level label for every request, so matching and display never need
-- the customer's exact address.

alter table profiles
  add column if not exists service_radius_km integer default 50;

alter table service_requests
  add column if not exists area_lat double precision,
  add column if not exists area_lng double precision,
  add column if not exists area_label text;

-- Backfill an approximate point for existing at-home requests.
update service_requests
set area_lat = round(location_lat::numeric, 2),
    area_lng = round(location_lng::numeric, 2)
where area_lat is null and location_lat is not null and location_lng is not null;
