-- Tax year: expenses with receipts and the full T2125-style category list,
-- a pro's or shop's tax settings (legal name, GST/HST number for display,
-- business type), and a private bucket for receipt photos.
-- Run after 20261122_import_save.sql. Safe to re-run.

-- 1. Expenses ------------------------------------------------------------
alter table business_expenses drop constraint if exists business_expenses_category_check;
alter table business_expenses add constraint business_expenses_category_check check (
  category in ('supplies', 'rent', 'advertising', 'licences', 'professional_fees', 'phone', 'vehicle', 'insurance', 'tools', 'education', 'other')
);
alter table business_expenses
  add column if not exists receipt_path text check (receipt_path is null or char_length(receipt_path) <= 300),
  add column if not exists updated_at timestamptz;

-- The owner reads their own expenses; a shop's owner reads the shop's.
-- Never members, never customers. Writes stay with the server.
create or replace function is_studio_owner(target_studio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from studios where id = target_studio and owner_id = auth.uid());
$$;

drop policy if exists "owners read their expenses" on business_expenses;
create policy "owners read their expenses" on business_expenses
  for select to authenticated
  using ((studio_id is null and owner_id = auth.uid()) or (studio_id is not null and is_studio_owner(studio_id)));

-- 2. Tax settings ---------------------------------------------------------
create table if not exists tax_settings (
  id uuid primary key default gen_random_uuid(),
  -- A pro's own (professional_id) or a shop's (studio_id), never both.
  professional_id uuid unique references profiles(id) on delete cascade,
  studio_id uuid unique references studios(id) on delete cascade,
  legal_name text check (legal_name is null or char_length(legal_name) <= 120),
  -- Shown on statements only. Nothing at checkout uses it.
  gst_number text check (gst_number is null or gst_number ~ '^[0-9]{9}( ?RT ?[0-9]{4})?$'),
  business_type text not null default 'sole_proprietor' check (business_type in ('sole_proprietor', 'partnership', 'corporation')),
  updated_at timestamptz not null default now(),
  constraint tax_settings_owner_check check ((professional_id is null) <> (studio_id is null))
);
alter table tax_settings enable row level security;
drop policy if exists "owners read their tax settings" on tax_settings;
create policy "owners read their tax settings" on tax_settings
  for select to authenticated
  using (professional_id = auth.uid() or (studio_id is not null and is_studio_owner(studio_id)));

-- 3. Receipt photos -------------------------------------------------------
-- Private. Files live at "<pro id>/..." or "shop/<studio id>/...".
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do update set public = false;

drop policy if exists "owners read their receipts" on storage.objects;
create policy "owners read their receipts" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'expense-receipts' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or ((storage.foldername(name))[1] = 'shop' and is_studio_owner(((storage.foldername(name))[2])::uuid))
    )
  );
-- Uploads and deletes go through the server (signed upload URLs), so there
-- are no insert, update or delete policies for signed-in users.
