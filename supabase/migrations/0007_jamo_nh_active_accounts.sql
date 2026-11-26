-- Jamo In-House monthly accounts and repeat-safe CSV import.
-- Legacy loans are classified as daily so the new product type stays distinct.

alter table public.loans
  add column if not exists account_type text not null default 'daily',
  add column if not exists source_system text,
  add column if not exists source_import_key text,
  add column if not exists source_due_status text,
  add column if not exists monthly_principal numeric(14, 2),
  add column if not exists monthly_interest numeric(14, 2),
  add column if not exists total_interest numeric(14, 2),
  add column if not exists principal_paid numeric(14, 2),
  add column if not exists interest_paid numeric(14, 2),
  add column if not exists principal_balance numeric(14, 2),
  add column if not exists accumulated_penalties numeric(14, 2),
  add column if not exists total_paid numeric(14, 2),
  add column if not exists months_paid integer;

alter table public.loans drop constraint if exists loans_account_type_check;
alter table public.loans add constraint loans_account_type_check
  check (account_type in ('daily', 'in_house'));

create unique index if not exists loans_source_import_key_idx
  on public.loans (source_import_key) where source_import_key is not null;

alter table public.borrowers
  add column if not exists source_system text not null default 'manual';

create unique index if not exists borrowers_source_system_code_idx
  on public.borrowers (source_system, source_borrower_code)
  where source_system = 'jamo_nh' and source_borrower_code is not null;

create or replace function public.import_jamo_nh_active_accounts(p_rows jsonb)
returns table (inserted_count integer, updated_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  row_data jsonb;
  borrower_uuid uuid;
  import_key text;
  was_existing boolean;
  inserted_total integer := 0;
  updated_total integer := 0;
  borrower_code text;
  loan_code text;
begin
  if actor is null then raise exception 'Not signed in.'; end if;
  if not public.is_admin() then
    raise exception 'Only an administrator can import Jamo In-House accounts.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'The import payload must be a JSON array.';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception 'The import must contain at least one account.';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'Import at most 1,000 accounts at a time.';
  end if;

  for row_data in select value from jsonb_array_elements(p_rows)
  loop
    borrower_code := nullif(btrim(row_data ->> 'client_id'), '');
    import_key := nullif(btrim(row_data ->> 'import_key'), '');
    loan_code := nullif(btrim(row_data ->> 'loan_id'), '');

    if borrower_code is null or import_key is null
      or nullif(btrim(row_data ->> 'full_name'), '') is null
      or nullif(btrim(row_data ->> 'issued_on'), '') is null
      or nullif(btrim(row_data ->> 'due_on'), '') is null
      or coalesce((row_data ->> 'principal')::numeric, 0) <= 0 then
      raise exception 'An account is missing required identity, date, or principal fields.';
    end if;

    insert into public.borrowers (
      source_system, source_borrower_code, full_name, address, phone, collateral, referral, created_by
    ) values (
      'jamo_nh', borrower_code, btrim(row_data ->> 'full_name'),
      nullif(btrim(row_data ->> 'address'), ''),
      nullif(btrim(row_data ->> 'phone'), ''),
      nullif(btrim(row_data ->> 'collateral'), ''),
      nullif(btrim(row_data ->> 'referral'), ''),
      actor
    )
    on conflict (source_system, source_borrower_code)
      where source_system = 'jamo_nh' and source_borrower_code is not null
    do update set
      full_name = excluded.full_name,
      address = excluded.address,
      phone = excluded.phone,
      collateral = excluded.collateral,
      referral = excluded.referral
    returning id into borrower_uuid;

    select exists (select 1 from public.loans l where l.source_import_key = import_key)
      into was_existing;

    insert into public.loans (
      borrower_name, borrower_phone, principal, status, account_type,
      borrower_id, source_loan_code, source_system, source_import_key,
      issued_on, due_on, contract_months, amount_paid, outstanding_balance, net_release,
      monthly_principal, monthly_interest, total_interest, principal_paid,
      interest_paid, principal_balance, accumulated_penalties, total_paid,
      months_paid, source_status, source_due_status, source_row, remarks
    ) values (
      btrim(row_data ->> 'full_name'), nullif(btrim(row_data ->> 'phone'), ''),
      (row_data ->> 'principal')::numeric, 'active', 'in_house', borrower_uuid,
      case when loan_code is null then null else 'JNH:' || loan_code end,
      'jamo_nh', import_key,
      (row_data ->> 'issued_on')::date, (row_data ->> 'due_on')::date,
      nullif(row_data ->> 'contract_months', '')::integer,
      coalesce(nullif(row_data ->> 'total_paid', '')::numeric, 0),
      nullif(row_data ->> 'total_balance', '')::numeric,
      nullif(row_data ->> 'net_release', '')::numeric,
      nullif(row_data ->> 'monthly_principal', '')::numeric,
      nullif(row_data ->> 'monthly_interest', '')::numeric,
      nullif(row_data ->> 'total_interest', '')::numeric,
      nullif(row_data ->> 'principal_paid', '')::numeric,
      nullif(row_data ->> 'interest_paid', '')::numeric,
      nullif(row_data ->> 'principal_balance', '')::numeric,
      nullif(row_data ->> 'accumulated_penalties', '')::numeric,
      nullif(row_data ->> 'total_paid', '')::numeric,
      nullif(row_data ->> 'months_paid', '')::integer,
      nullif(btrim(row_data ->> 'account_status'), ''),
      nullif(btrim(row_data ->> 'due_status'), ''),
      nullif(row_data ->> 'source_row', '')::integer,
      nullif(btrim(row_data ->> 'remarks'), '')
    )
    on conflict (source_import_key) where source_import_key is not null
    do update set
      borrower_name = excluded.borrower_name, borrower_phone = excluded.borrower_phone,
      principal = excluded.principal, status = 'active', account_type = 'in_house',
      borrower_id = excluded.borrower_id, source_loan_code = excluded.source_loan_code,
      source_system = excluded.source_system, issued_on = excluded.issued_on,
      due_on = excluded.due_on, contract_months = excluded.contract_months,
      amount_paid = excluded.amount_paid, outstanding_balance = excluded.outstanding_balance,
      net_release = excluded.net_release,
      monthly_principal = excluded.monthly_principal, monthly_interest = excluded.monthly_interest,
      total_interest = excluded.total_interest, principal_paid = excluded.principal_paid,
      interest_paid = excluded.interest_paid, principal_balance = excluded.principal_balance,
      accumulated_penalties = excluded.accumulated_penalties, total_paid = excluded.total_paid,
      months_paid = excluded.months_paid, source_status = excluded.source_status,
      source_due_status = excluded.source_due_status, source_row = excluded.source_row,
      remarks = excluded.remarks;

    if was_existing then updated_total := updated_total + 1;
    else inserted_total := inserted_total + 1;
    end if;
  end loop;

  return query select inserted_total, updated_total;
end;
$$;

revoke all on function public.import_jamo_nh_active_accounts(jsonb) from public, anon;
grant execute on function public.import_jamo_nh_active_accounts(jsonb) to authenticated;


-- The importer trusts the administrator role, so users cannot promote themselves
-- through the existing profile self-update policy.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an administrator can change profile roles.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_role_change on public.profiles;
create trigger guard_profile_role_change
  before update of role on public.profiles
  for each row execute function public.guard_profile_role_change();
