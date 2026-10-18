-- Detailed DCPR accounts, transaction references and cash expenses.
alter table public.cash_position_openings
  add column if not exists account_code text;
update public.cash_position_openings
set account_code = case when mode = 'bank' then 'metrobank' else 'gcash' end
where account_code is null;
alter table public.cash_position_openings alter column account_code set not null;
alter table public.cash_position_openings drop constraint if exists cash_position_openings_created_by_mode_occurred_on_key;
alter table public.cash_position_openings drop constraint if exists cash_position_openings_account_code_check;
alter table public.cash_position_openings add constraint cash_position_openings_account_code_check
  check (account_code in ('metrobank', 'eastwest', 'jamo_savings', 'gcash', 'cebuana'));
alter table public.cash_position_openings add constraint cash_position_openings_created_by_account_date_key
  unique (created_by, account_code, occurred_on);

alter table public.cash_position_ledger
  add column if not exists account_code text,
  add column if not exists category text not null default 'Other',
  add column if not exists reference text,
  add column if not exists counterparty text;
update public.cash_position_ledger
set account_code = case when mode = 'bank' then 'metrobank' else 'gcash' end
where account_code is null;
alter table public.cash_position_ledger alter column account_code set not null;
alter table public.cash_position_ledger drop constraint if exists cash_position_ledger_account_code_check;
alter table public.cash_position_ledger add constraint cash_position_ledger_account_code_check
  check (account_code in ('metrobank', 'eastwest', 'jamo_savings', 'gcash', 'cebuana'));
alter table public.cash_position_ledger drop constraint if exists cash_position_ledger_category_check;
alter table public.cash_position_ledger add constraint cash_position_ledger_category_check
  check (category in ('Cash deposit', 'Cash withdrawal', 'Bank fee', 'Savings adjustment', 'GCash sent', 'GCash received', 'Cebuana sent', 'Cebuana received', 'Other'));
create index if not exists cash_position_ledger_account_date
  on public.cash_position_ledger (occurred_on, account_code);

alter table public.cash_ledger
  add column if not exists category text,
  add column if not exists reference text,
  add column if not exists counterparty text;
alter table public.cash_ledger drop constraint if exists cash_ledger_type_check;
alter table public.cash_ledger add constraint cash_ledger_type_check
  check (type in ('release', 'collection', 'expense', 'transfer_in', 'transfer_out'));

create or replace function public.record_cash_position_transfer(
  p_mode text,
  p_account_code text,
  p_direction text,
  p_amount numeric,
  p_occurred_on date,
  p_category text,
  p_reference text,
  p_counterparty text,
  p_note text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  cash_type text;
begin
  if actor is null then raise exception 'Not signed in.'; end if;
  if p_amount <= 0 then raise exception 'Amount must be greater than zero.'; end if;
  if p_category = 'Cash deposit' and p_direction = 'inflow' then
    cash_type := 'transfer_out';
  elsif p_category = 'Cash withdrawal' and p_direction = 'outflow' then
    cash_type := 'transfer_in';
  else
    raise exception 'Cash deposit and withdrawal directions do not match.';
  end if;

  insert into public.cash_position_ledger
    (mode, account_code, direction, category, amount, occurred_on, reference, counterparty, note, created_by)
  values
    (p_mode, p_account_code, p_direction, p_category, p_amount, p_occurred_on, p_reference, p_counterparty, p_note, actor);

  insert into public.cash_ledger
    (type, amount, occurred_on, category, reference, counterparty, note, created_by)
  values
    (cash_type, p_amount, p_occurred_on,
     case when cash_type = 'transfer_out' then 'Deposit to ' else 'Withdrawal from ' end || p_account_code,
     p_reference, p_counterparty, p_note, actor);
end;
$$;
