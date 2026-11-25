-- Jamo loan portfolio additions. Safe to re-run; tables and columns are guarded.
-- Existing public.loans is extended rather than recreated.

create table if not exists public.borrowers (
  id uuid primary key default gen_random_uuid(),
  source_borrower_code text,
  full_name text not null,
  address text,
  phone text,
  collateral text,
  referral text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists borrowers_source_code_idx on public.borrowers (source_borrower_code);
create index if not exists borrowers_name_idx on public.borrowers (full_name);

alter table public.loans
  add column if not exists borrower_id uuid references public.borrowers (id) on delete set null,
  add column if not exists source_loan_code text,
  add column if not exists issued_on date,
  add column if not exists due_on date,
  add column if not exists interest_rate numeric(7, 5),
  add column if not exists contract_months integer,
  add column if not exists amount_paid numeric(14, 2) not null default 0,
  add column if not exists outstanding_balance numeric(14, 2),
  add column if not exists processing_fee numeric(14, 2) not null default 0,
  add column if not exists insurance_fee numeric(14, 2) not null default 0,
  add column if not exists notarial_fee numeric(14, 2) not null default 0,
  add column if not exists net_release numeric(14, 2),
  add column if not exists remarks text;
create unique index if not exists loans_source_loan_code_idx
  on public.loans (source_loan_code) where source_loan_code is not null;

create table if not exists public.loan_installments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  installment_no integer not null check (installment_no > 0),
  due_on date not null,
  expected_principal numeric(14, 2) not null default 0 check (expected_principal >= 0),
  expected_interest numeric(14, 2) not null default 0 check (expected_interest >= 0),
  principal_paid numeric(14, 2) not null default 0 check (principal_paid >= 0),
  interest_paid numeric(14, 2) not null default 0 check (interest_paid >= 0),
  status text not null default 'pending' check (status in ('pending', 'partial', 'paid', 'overdue', 'waived')),
  created_at timestamptz not null default now(),
  unique (loan_id, installment_no)
);
create index if not exists loan_installments_due_idx on public.loan_installments (due_on, status);

create table if not exists public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  installment_id uuid references public.loan_installments (id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  principal_amount numeric(14, 2) not null default 0 check (principal_amount >= 0),
  interest_amount numeric(14, 2) not null default 0 check (interest_amount >= 0),
  penalty_amount numeric(14, 2) not null default 0 check (penalty_amount >= 0),
  paid_on date not null default current_date,
  reference text,
  note text,
  recorded_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (principal_amount + interest_amount + penalty_amount <= amount)
);
create index if not exists loan_repayments_loan_date_idx on public.loan_repayments (loan_id, paid_on);

alter table public.borrowers enable row level security;
alter table public.loan_installments enable row level security;
alter table public.loan_repayments enable row level security;

drop policy if exists "staff manage own borrowers" on public.borrowers;
create policy "staff manage own borrowers" on public.borrowers for all to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "staff manage installments for own loans" on public.loan_installments;
create policy "staff manage installments for own loans" on public.loan_installments for all to authenticated
  using (exists (select 1 from public.loans l left join public.collectors c on c.id = l.collector_id
    where l.id = loan_installments.loan_id and (c.created_by = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.loans l left join public.collectors c on c.id = l.collector_id
    where l.id = loan_installments.loan_id and (c.created_by = auth.uid() or public.is_admin())));

drop policy if exists "staff manage repayments for own loans" on public.loan_repayments;
create policy "staff manage repayments for own loans" on public.loan_repayments for all to authenticated
  using (recorded_by = auth.uid() or public.is_admin())
  with check (recorded_by = auth.uid() or public.is_admin());
