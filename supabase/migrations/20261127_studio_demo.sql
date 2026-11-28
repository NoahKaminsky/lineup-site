-- A sample shop for showing LineUp to shop owners. A demo shop is reachable
-- only by its link: it's left out of Find a shop, city pages and the sitemap,
-- its page says it's a sample, and its booking step never takes payment.
-- Its pros stay unverified, so they never appear in Explore or get requests.
-- Safe to run more than once.

alter table studios add column if not exists is_demo boolean not null default false;
