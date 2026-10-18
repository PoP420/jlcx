-- Bank and digital balances plus end-of-day physical cash reconciliation.
create table if not exists public.cash_position_openings (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('bank', 'digital')),
  occurred_on date not null,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  created_by uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (created_by, mode, occurred_on)
);

create table if not exists public.cash_position_ledger (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('bank', 'digital')),
  direction text not null check (direction in ('inflow', 'outflow')),
  amount numeric(14, 2) not null check (amount > 0),
  note text,
  occurred_on date not null default current_date,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists cash_position_ledger_date_mode
  on public.cash_position_ledger (occurred_on, mode);

create table if not exists public.cash_position_counts (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  denominations jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (created_by, occurred_on)
);

alter table public.cash_position_openings enable row level security;
alter table public.cash_position_ledger enable row level security;
alter table public.cash_position_counts enable row level security;

drop policy if exists "users manage own position openings" on public.cash_position_openings;
create policy "users manage own position openings"
  on public.cash_position_openings for all to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "users manage own position ledger" on public.cash_position_ledger;
create policy "users manage own position ledger"
  on public.cash_position_ledger for all to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "users manage own position counts" on public.cash_position_counts;
create policy "users manage own position counts"
  on public.cash_position_counts for all to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
