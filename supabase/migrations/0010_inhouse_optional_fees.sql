alter table public.loans
  add column if not exists savings_fee numeric(14, 2) not null default 0,
  add column if not exists apply_processing_fee boolean not null default false,
  add column if not exists apply_insurance_fee boolean not null default false,
  add column if not exists apply_notarial_fee boolean not null default false,
  add column if not exists apply_savings_fee boolean not null default false;

-- Calculate the optional in-house deductions from principal on the database
-- side as well as in the preview. The wrapped RPC stays atomic with the base
-- loan, schedule, and cash-release operation.
create or replace function public.create_managed_loan_with_savings(
  p_loan jsonb,
  p_installments jsonb,
  p_disburse boolean default false
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_loan_id uuid;
  principal_amount numeric(14,2) := coalesce((p_loan ->> 'principal')::numeric, 0);
  normalized_loan jsonb := p_loan;
  processing_amount numeric(14,2) := 0;
  insurance_amount numeric(14,2) := 0;
  notary_amount numeric(14,2) := 0;
  savings_amount numeric(14,2) := 0;
begin
  if p_loan ->> 'account_type' = 'in_house' then
    processing_amount := case when coalesce((p_loan ->> 'apply_processing_fee')::boolean, false) then round(principal_amount * 0.03, 2) else 0 end;
    insurance_amount := case when coalesce((p_loan ->> 'apply_insurance_fee')::boolean, false) then round(principal_amount * 0.02, 2) else 0 end;
    notary_amount := case when coalesce((p_loan ->> 'apply_notarial_fee')::boolean, false) then round(principal_amount * 0.01, 2) else 0 end;
    savings_amount := case when coalesce((p_loan ->> 'apply_savings_fee')::boolean, false) then round(principal_amount * 0.02, 2) else 0 end;
    normalized_loan := p_loan || jsonb_build_object(
      'processing_fee', processing_amount,
      'insurance_fee', insurance_amount,
      'notarial_fee', notary_amount,
      'savings_fee', savings_amount,
      'net_release', principal_amount - processing_amount - insurance_amount - notary_amount - savings_amount
    );
  else
    normalized_loan := p_loan || jsonb_build_object(
      'savings_fee', 0,
      'apply_processing_fee', false,
      'apply_insurance_fee', false,
      'apply_notarial_fee', false,
      'apply_savings_fee', false
    );
  end if;

  new_loan_id := public.create_managed_loan(normalized_loan, p_installments, p_disburse);
  update public.loans set
    savings_fee = savings_amount,
    apply_processing_fee = coalesce((normalized_loan ->> 'apply_processing_fee')::boolean, false),
    apply_insurance_fee = coalesce((normalized_loan ->> 'apply_insurance_fee')::boolean, false),
    apply_notarial_fee = coalesce((normalized_loan ->> 'apply_notarial_fee')::boolean, false),
    apply_savings_fee = coalesce((normalized_loan ->> 'apply_savings_fee')::boolean, false)
  where id = new_loan_id;
  return new_loan_id;
end;
$$;

revoke all on function public.create_managed_loan_with_savings(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.create_managed_loan_with_savings(jsonb, jsonb, boolean) to authenticated;

create or replace function public.update_managed_loan_with_savings(
  p_loan_id uuid,
  p_loan jsonb,
  p_installments jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  principal_amount numeric(14,2) := coalesce((p_loan ->> 'principal')::numeric, 0);
  normalized_loan jsonb := p_loan;
  processing_amount numeric(14,2) := 0;
  insurance_amount numeric(14,2) := 0;
  notary_amount numeric(14,2) := 0;
  savings_amount numeric(14,2) := 0;
begin
  if p_loan ->> 'account_type' = 'in_house' then
    processing_amount := case when coalesce((p_loan ->> 'apply_processing_fee')::boolean, false) then round(principal_amount * 0.03, 2) else 0 end;
    insurance_amount := case when coalesce((p_loan ->> 'apply_insurance_fee')::boolean, false) then round(principal_amount * 0.02, 2) else 0 end;
    notary_amount := case when coalesce((p_loan ->> 'apply_notarial_fee')::boolean, false) then round(principal_amount * 0.01, 2) else 0 end;
    savings_amount := case when coalesce((p_loan ->> 'apply_savings_fee')::boolean, false) then round(principal_amount * 0.02, 2) else 0 end;
    normalized_loan := p_loan || jsonb_build_object(
      'processing_fee', processing_amount,
      'insurance_fee', insurance_amount,
      'notarial_fee', notary_amount,
      'savings_fee', savings_amount,
      'net_release', principal_amount - processing_amount - insurance_amount - notary_amount - savings_amount
    );
  else
    normalized_loan := p_loan || jsonb_build_object(
      'savings_fee', 0,
      'apply_processing_fee', false,
      'apply_insurance_fee', false,
      'apply_notarial_fee', false,
      'apply_savings_fee', false
    );
  end if;

  perform public.update_managed_loan(p_loan_id, normalized_loan, p_installments);
  update public.loans set savings_fee = savings_amount where id = p_loan_id;
  update public.loans set
    apply_processing_fee = coalesce((normalized_loan ->> 'apply_processing_fee')::boolean, false),
    apply_insurance_fee = coalesce((normalized_loan ->> 'apply_insurance_fee')::boolean, false),
    apply_notarial_fee = coalesce((normalized_loan ->> 'apply_notarial_fee')::boolean, false),
    apply_savings_fee = coalesce((normalized_loan ->> 'apply_savings_fee')::boolean, false)
  where id = p_loan_id;
end;
$$;

revoke all on function public.update_managed_loan_with_savings(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_managed_loan_with_savings(uuid, jsonb, jsonb) to authenticated;
