-- Tools that make Analytics and Earnings usable day to day:
--   a monthly sales goal, win-back nudges to overdue clients (logged so
--   nobody is nudged twice in a month), a weekly summary email pros can turn
--   off, and business expenses for the earnings statement.
alter table profiles
  add column if not exists sales_goal_cents integer check (sales_goal_cents is null or sales_goal_cents between 0 and 100000000),
  add column if not exists weekly_summary_opt_out boolean not null default false;

alter table studios
  add column if not exists sales_goal_cents integer check (sales_goal_cents is null or sales_goal_cents between 0 and 100000000);

create table if not exists winback_nudges (
  id bigint generated always as identity primary key,
  professional_id uuid not null references profiles(id) on delete cascade,
  customer_id uuid not null references profiles(id) on delete cascade,
  sent_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists winback_nudges_pro_time on winback_nudges (professional_id, created_at desc);
create index if not exists winback_nudges_customer_time on winback_nudges (customer_id, created_at desc);
alter table winback_nudges enable row level security;
-- No policies: only server routes read or write.

create table if not exists business_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  studio_id uuid references studios(id) on delete cascade,
  expense_date date not null,
  category text not null check (category in ('supplies', 'rent', 'tools', 'advertising', 'insurance', 'licences', 'phone', 'vehicle', 'education', 'other')),
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  gst_cents integer not null default 0 check (gst_cents between 0 and 100000000),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists business_expenses_owner_date on business_expenses (owner_id, expense_date);
create index if not exists business_expenses_studio_date on business_expenses (studio_id, expense_date) where studio_id is not null;
alter table business_expenses enable row level security;
-- No policies: only server routes read or write.

-- Products sold over the counter (pomade, beard oil), logged by hand so the
-- income shows in Earnings. No stock counts.
create table if not exists product_sales (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references profiles(id) on delete cascade,
  studio_id uuid references studios(id) on delete cascade,
  sale_date date not null,
  item text not null check (char_length(item) between 1 and 120),
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  paid_with text check (paid_with is null or paid_with in ('cash', 'card', 'etransfer', 'other')),
  created_at timestamptz not null default now()
);
create index if not exists product_sales_pro_date on product_sales (professional_id, sale_date);
create index if not exists product_sales_studio_date on product_sales (studio_id, sale_date) where studio_id is not null;
alter table product_sales enable row level security;
