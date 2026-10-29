-- One public booking page per studio: lineup-aesthetics.ca/shop/<slug>.
-- Run after 20261030_front_desk_and_booth_rent.sql. Safe to re-run.

alter table studios
  add column if not exists slug text,
  add column if not exists tagline text;

alter table studios drop constraint if exists studios_slug_format;
alter table studios
  add constraint studios_slug_format check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40);
alter table studios drop constraint if exists studios_tagline_length;
alter table studios
  add constraint studios_tagline_length check (tagline is null or char_length(tagline) <= 160);

create unique index if not exists studios_slug_idx on studios (slug);

-- Give studios created before this a link made from their name (plus a short
-- piece of their id, so two shops with the same name don't collide).
update studios
set slug = left(
      trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')),
      30
    ) || '-' || left(id::text, 4)
where slug is null;
