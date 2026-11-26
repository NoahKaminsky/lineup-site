-- Shop profiles, like a business listing on LineUp: a cover photo, logo,
-- photo gallery, about, opening hours, contact links and amenities, plus
-- reviews of the shop from clients who had a completed visit there.
--
-- Existing tables keep their RLS exactly as it was; studios only gains
-- optional columns. The two new tables can be read by anyone (they're shown
-- on the public shop page) and are only written by LineUp's server (service
-- role), which checks who's allowed: the shop's owner and managers for
-- photos, a client with a completed booking at the shop for a review, the
-- owner and managers for a reply.

alter table public.studios
  add column if not exists about text,
  add column if not exists cover_url text,
  add column if not exists logo_url text,
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists instagram text,
  -- Opening hours: {"0": [["09:00","17:00"]], "1": [...], ...} (0 = Sunday).
  -- Null means "show the team's combined hours".
  add column if not exists hours jsonb,
  add column if not exists amenities text[] not null default '{}'::text[];

alter table public.studios
  add constraint studios_about_length check (about is null or char_length(about) <= 1500),
  add constraint studios_phone_length check (phone is null or char_length(phone) <= 40),
  add constraint studios_website_length check (website is null or char_length(website) <= 200),
  add constraint studios_instagram_length check (instagram is null or char_length(instagram) <= 60);

create table if not exists public.studio_photos (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  url text not null,
  caption text check (caption is null or char_length(caption) <= 140),
  sort integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists studio_photos_studio_idx on public.studio_photos (studio_id, sort, created_at);

create table if not exists public.studio_reviews (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  -- The completed visit it's about: one review per visit.
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  reply text check (reply is null or char_length(reply) <= 1000),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists studio_reviews_studio_idx on public.studio_reviews (studio_id, created_at desc);

alter table public.studio_photos enable row level security;
alter table public.studio_reviews enable row level security;

-- Read-only for everyone; no insert/update/delete policies, so only the
-- server (service role) writes.
create policy "Anyone can view shop photos" on public.studio_photos for select using (true);
create policy "Anyone can view shop reviews" on public.studio_reviews for select using (true);
