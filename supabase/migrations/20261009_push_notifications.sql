-- Web push notification subscriptions.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- One row per browser/device a user has granted notification permission on
-- (someone can have several -- phone + laptop, etc.). No consent column
-- needed here the way SMS needed one: a row only exists because the
-- browser's own native permission prompt was already granted, which is the
-- consent.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "users manage their own push subscriptions" on push_subscriptions;
create policy "users manage their own push subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
