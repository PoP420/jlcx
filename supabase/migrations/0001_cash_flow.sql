-- Cash Flow & Collections schema for Jamo Lending Corp
-- Every table is protected by RLS. Rows are scoped to the authenticated
-- user through the profiles row that is created at signup (or backfilled
-- below for pre-existing users).

-- ---------------------------------------------------------------------------
-- 1. Profiles: one row per auth.user, carries display name and role.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'staff' check (role in ('staff', 'admin')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row for every new signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill profiles for users that existed before this migration ran.
insert into public.profiles (id, full_name)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

-- Admin helper used by the RLS policies below.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Collectors: staff members who hold cash on hand.
-- ---------------------------------------------------------------------------

create table if not exists public.collectors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  active boolean not null default true,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Loans: created implicitly when cash is released to a borrower.
-- ---------------------------------------------------------------------------

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  borrower_name text not null,
  principal numeric(14, 2) not null default 0,
  collector_id uuid references public.collectors (id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'closed', 'written_off')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Cash ledger: releases (cash out) and collections (cash in).
-- ---------------------------------------------------------------------------

create table if not exists public.cash_ledger (
  id uuid primary key default gen_random_uuid(),
  collector_id uuid references public.collectors (id) on delete set null,
  loan_id uuid references public.loans (id) on delete set null,
  type text not null check (type in ('release', 'collection')),
  amount numeric(14, 2) not null check (amount > 0),
  note text,
  denominations jsonb,
  occurred_on date not null default current_date,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Opening cash: the shared starting float for the day.
--    A null collector_id marks the shared pool that every
--    collector releases from. Balance = opening - releases + collections.
-- ---------------------------------------------------------------------------

create table if not exists public.cash_opening (
  collector_id uuid references public.collectors (id) on delete cascade,
  occurred_on date not null default current_date,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  denominations jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- One row per collector per day; the shared pool has exactly
-- one row per day (null collector_id).
create unique index if not exists cash_opening_collector_day
  on public.cash_opening (collector_id, occurred_on)
  where collector_id is not null;

create unique index if not exists cash_opening_shared_day
  on public.cash_opening (occurred_on)
  where collector_id is null;

-- ---------------------------------------------------------------------------
-- 5b. Forward compatibility for databases created by earlier
--     versions of this script (columns/indexes added later).
-- ---------------------------------------------------------------------------

alter table public.cash_ledger
  add column if not exists denominations jsonb;

alter table public.cash_opening
  add column if not exists denominations jsonb not null default '{}'::jsonb;

alter table public.cash_opening
  drop constraint if exists cash_opening_pkey;

alter table public.cash_opening
  alter column collector_id drop not null;

-- ---------------------------------------------------------------------------
-- Row level security
--   Policies are dropped first so this script can be re-run safely
--   (PostgreSQL has no "create policy if not exists").
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.collectors enable row level security;
alter table public.loans enable row level security;
alter table public.cash_ledger enable row level security;
alter table public.cash_opening enable row level security;

-- Profiles: users read/write their own row only.
drop policy if exists "users see own profile" on public.profiles;
create policy "users see own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Collectors: staff manage their own collectors; admins manage all.
drop policy if exists "staff manage own collectors" on public.collectors;
create policy "staff manage own collectors"
  on public.collectors for all to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

-- Loans: ownership flows through the collector that services the loan.
drop policy if exists "staff see own loans" on public.loans;
create policy "staff see own loans"
  on public.loans for select to authenticated
  using (
    collector_id in (
      select c.id from public.collectors c where c.created_by = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "staff insert own loans" on public.loans;
create policy "staff insert own loans"
  on public.loans for insert to authenticated
  with check (
    collector_id in (
      select c.id from public.collectors c where c.created_by = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "staff update own loans" on public.loans;
create policy "staff update own loans"
  on public.loans for update to authenticated
  using (
    collector_id in (
      select c.id from public.collectors c where c.created_by = auth.uid()
    )
    or public.is_admin()
  )
  with check (
    collector_id in (
      select c.id from public.collectors c where c.created_by = auth.uid()
    )
    or public.is_admin()
  );

-- Cash ledger: staff see and record their own entries; admins see all.
drop policy if exists "staff manage own ledger entries" on public.cash_ledger;
create policy "staff manage own ledger entries"
  on public.cash_ledger for all to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

-- Opening cash: staff set their own collectors' starting cash; admins all.
drop policy if exists "staff manage own opening cash" on public.cash_opening;
create policy "staff manage own opening cash"
  on public.cash_opening for all to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
