-- Which first-run guides each person has already seen or dismissed: the
-- welcome tours, the page tips and the getting-started checklists
-- (keys like 'tour:shop', 'tip:services', 'checklist:customer').
-- Kept on the profile so a tip closed on a phone stays closed on a laptop.
--
-- Additive only. RLS is unchanged: people already update their own profile
-- row ("Users can update their own profile"), and none of the protect_*
-- triggers touch this column.

alter table public.profiles
  add column if not exists guides_seen text[] not null default '{}'::text[];

comment on column public.profiles.guides_seen is
  'First-run guides this person has seen or dismissed (tours, page tips, checklists).';
