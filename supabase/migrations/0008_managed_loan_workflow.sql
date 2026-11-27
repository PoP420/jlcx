-- Atomic borrower-linked loan, schedule, and optional cash disbursement.
-- Existing table names and ownership policies remain the source of authority.
create or replace function public.create_managed_loan(
  p_loan jsonb,
  p_installments jsonb,
  p_disburse boolean default false
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  new_loan_id uuid;
  borrower_uuid uuid := nullif(p_loan ->> 'borrower_id', '')::uuid;
  collector_uuid uuid := nullif(p_loan ->> 'collector_id', '')::uuid;
  principal_amount numeric(14,2) := (p_loan ->> 'principal')::numeric;
  installment jsonb;
begin
  if actor is null then raise exception 'Not signed in.'; end if;
  if borrower_uuid is null or not exists (
    select 1 from public.borrowers b where b.id = borrower_uuid
  ) then raise exception 'Choose an accessible borrower.'; end if;
  if principal_amount is null or principal_amount <= 0 then raise exception 'Principal must be greater than zero.'; end if;
  if (p_loan ->> 'account_type') not in ('daily', 'in_house')
    or coalesce((p_loan ->> 'contract_months')::integer, 0) < 1
    or (p_loan ->> 'account_type' = 'daily' and (p_loan ->> 'contract_months')::integer > 2)
    or (p_loan ->> 'account_type' = 'in_house' and (p_loan ->> 'contract_months')::integer > 600) then
    raise exception 'Choose a valid product and term.';
  end if;
  if collector_uuid is null or not exists (
    select 1 from public.collectors c where c.id = collector_uuid and c.active
  ) then raise exception 'Choose an active collector.'; end if;
  if not public.is_admin() and not exists (
    select 1 from public.collectors c where c.id = collector_uuid and c.created_by = actor
  ) then raise exception 'You can only assign loans to your collectors.'; end if;
  if p_installments is null or jsonb_typeof(p_installments) <> 'array' or jsonb_array_length(p_installments) = 0 then
    raise exception 'A repayment schedule is required.';
  end if;
  if jsonb_array_length(p_installments) > 600 then raise exception 'The repayment schedule is too long.'; end if;
  if p_disburse and coalesce((p_loan ->> 'net_release')::numeric, 0) <= 0 then
    raise exception 'Net release must be greater than zero to record a disbursement.';
  end if;

  insert into public.loans (
    borrower_id, borrower_name, borrower_phone, principal, account_type, collector_id,
    status, issued_on, due_on, interest_rate, contract_months, processing_fee,
    insurance_fee, notarial_fee, net_release, outstanding_balance, remarks
  ) values (
    borrower_uuid, (select b.full_name from public.borrowers b where b.id = borrower_uuid),
    (select b.phone from public.borrowers b where b.id = borrower_uuid),
    principal_amount, p_loan ->> 'account_type', collector_uuid, 'active',
    (p_loan ->> 'issued_on')::date, (p_loan ->> 'due_on')::date,
    (p_loan ->> 'interest_rate')::numeric, (p_loan ->> 'contract_months')::integer,
    coalesce((p_loan ->> 'processing_fee')::numeric, 0),
    coalesce((p_loan ->> 'insurance_fee')::numeric, 0),
    coalesce((p_loan ->> 'notarial_fee')::numeric, 0),
    (p_loan ->> 'net_release')::numeric, (p_loan ->> 'outstanding_balance')::numeric,
    nullif(btrim(p_loan ->> 'remarks'), '')
  ) returning id into new_loan_id;

  for installment in select value from jsonb_array_elements(p_installments)
  loop
    insert into public.loan_installments (
      loan_id, installment_no, due_on, expected_principal, expected_interest
    ) values (
      new_loan_id, (installment ->> 'installment_no')::integer,
      (installment ->> 'due_on')::date,
      (installment ->> 'expected_principal')::numeric,
      (installment ->> 'expected_interest')::numeric
    );
  end loop;

  if p_disburse then
    insert into public.cash_ledger (
      collector_id, loan_id, type, amount, category, counterparty, note, occurred_on, created_by
    ) values (
      collector_uuid, new_loan_id, 'release',
      (p_loan ->> 'net_release')::numeric, 'Loan disbursement',
      btrim(p_loan ->> 'borrower_name'), nullif(btrim(p_loan ->> 'remarks'), ''),
      (p_loan ->> 'issued_on')::date, actor
    );
  end if;
  return new_loan_id;
end;
$$;

revoke all on function public.create_managed_loan(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.create_managed_loan(jsonb, jsonb, boolean) to authenticated;

create or replace function public.update_managed_loan(
  p_loan_id uuid,
  p_loan jsonb,
  p_installments jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  installment jsonb;
begin
  if actor is null then raise exception 'Not signed in.'; end if;
  if not exists (
    select 1 from public.loans l left join public.collectors c on c.id = l.collector_id
    where l.id = p_loan_id and (c.created_by = actor or public.is_admin())
  ) then raise exception 'Loan not found or not accessible.'; end if;
  perform 1 from public.loans where id = p_loan_id for update;
  if exists (select 1 from public.loan_repayments where loan_id = p_loan_id)
    or exists (select 1 from public.cash_ledger where loan_id = p_loan_id) then
    raise exception 'Serviced or disbursed loans cannot have their terms replaced.';
  end if;
  if coalesce((p_loan ->> 'principal')::numeric, 0) <= 0
    or (p_loan ->> 'account_type') not in ('daily', 'in_house')
    or coalesce((p_loan ->> 'contract_months')::integer, 0) < 1
    or (p_loan ->> 'account_type' = 'daily' and (p_loan ->> 'contract_months')::integer > 2)
    or (p_loan ->> 'account_type' = 'in_house' and (p_loan ->> 'contract_months')::integer > 600)
    or p_installments is null or jsonb_typeof(p_installments) <> 'array'
    or jsonb_array_length(p_installments) = 0 or jsonb_array_length(p_installments) > 600 then
    raise exception 'Choose valid loan terms and a repayment schedule.';
  end if;
  if not exists (select 1 from public.borrowers b where b.id = nullif(p_loan ->> 'borrower_id', '')::uuid
    and (b.created_by = actor or public.is_admin())) then raise exception 'Choose an accessible borrower.'; end if;
  if not exists (select 1 from public.collectors c where c.id = nullif(p_loan ->> 'collector_id', '')::uuid
    and c.active and (c.created_by = actor or public.is_admin())) then raise exception 'Choose an active collector you can access.'; end if;
  update public.loans set
    borrower_id = nullif(p_loan ->> 'borrower_id', '')::uuid,
    borrower_name = (select b.full_name from public.borrowers b where b.id = nullif(p_loan ->> 'borrower_id', '')::uuid),
    borrower_phone = (select b.phone from public.borrowers b where b.id = nullif(p_loan ->> 'borrower_id', '')::uuid),
    principal = (p_loan ->> 'principal')::numeric,
    account_type = p_loan ->> 'account_type',
    collector_id = nullif(p_loan ->> 'collector_id', '')::uuid,
    issued_on = (p_loan ->> 'issued_on')::date,
    due_on = (p_loan ->> 'due_on')::date,
    interest_rate = (p_loan ->> 'interest_rate')::numeric,
    contract_months = (p_loan ->> 'contract_months')::integer,
    processing_fee = coalesce((p_loan ->> 'processing_fee')::numeric, 0),
    insurance_fee = coalesce((p_loan ->> 'insurance_fee')::numeric, 0),
    notarial_fee = coalesce((p_loan ->> 'notarial_fee')::numeric, 0),
    net_release = (p_loan ->> 'net_release')::numeric,
    outstanding_balance = (p_loan ->> 'outstanding_balance')::numeric,
    remarks = nullif(btrim(p_loan ->> 'remarks'), '')
  where id = p_loan_id;
  if not found then raise exception 'Loan not found or not accessible.'; end if;

  delete from public.loan_installments where loan_id = p_loan_id;
  for installment in select value from jsonb_array_elements(p_installments)
  loop
    insert into public.loan_installments (
      loan_id, installment_no, due_on, expected_principal, expected_interest
    ) values (
      p_loan_id, (installment ->> 'installment_no')::integer,
      (installment ->> 'due_on')::date,
      (installment ->> 'expected_principal')::numeric,
      (installment ->> 'expected_interest')::numeric
    );
  end loop;
end;
$$;

revoke all on function public.update_managed_loan(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_managed_loan(uuid, jsonb, jsonb) to authenticated;

create or replace function public.delete_managed_borrower(p_borrower_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Not signed in.'; end if;
  if not exists (select 1 from public.borrowers b where b.id = p_borrower_id
    and (b.created_by = actor or public.is_admin())) then raise exception 'Borrower not found or not accessible.'; end if;
  if exists (select 1 from public.loans where borrower_id = p_borrower_id) then
    raise exception 'This borrower has loan history. Keep the profile so its loans remain linked.';
  end if;
  delete from public.borrowers where id = p_borrower_id;
end;
$$;

revoke all on function public.delete_managed_borrower(uuid) from public, anon;
grant execute on function public.delete_managed_borrower(uuid) to authenticated;

create or replace function public.delete_managed_loan(p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Not signed in.'; end if;
  if not exists (select 1 from public.loans l left join public.collectors c on c.id = l.collector_id
    where l.id = p_loan_id and (c.created_by = actor or public.is_admin())) then raise exception 'Loan not found or not accessible.'; end if;
  perform 1 from public.loans where id = p_loan_id for update;
  if exists (select 1 from public.loan_repayments where loan_id = p_loan_id)
    or exists (select 1 from public.cash_ledger where loan_id = p_loan_id) then
    raise exception 'This loan has servicing or disbursement history and cannot be deleted.';
  end if;
  delete from public.loans where id = p_loan_id;
end;
$$;

revoke all on function public.delete_managed_loan(uuid) from public, anon;
grant execute on function public.delete_managed_loan(uuid) to authenticated;

-- Repayment access follows the loan's collector ownership, matching installment access.
drop policy if exists "staff manage repayments for own loans" on public.loan_repayments;
create policy "staff manage repayments for own loans" on public.loan_repayments for all to authenticated
  using (exists (
    select 1 from public.loans l left join public.collectors c on c.id = l.collector_id
    where l.id = loan_repayments.loan_id and (c.created_by = auth.uid() or public.is_admin())
  ))
  with check (recorded_by = auth.uid() and exists (
    select 1 from public.loans l left join public.collectors c on c.id = l.collector_id
    where l.id = loan_repayments.loan_id and (c.created_by = auth.uid() or public.is_admin())
  ));
