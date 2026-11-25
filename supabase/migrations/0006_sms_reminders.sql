-- SMS reminders and MAXXtext dispatch audit trail.

alter table public.loans
  add column if not exists borrower_phone text,
  add column if not exists borrower_sms_consent boolean not null default false,
  add column if not exists borrower_sms_opted_out boolean not null default false;
alter table public.collectors
  add column if not exists sms_enabled boolean not null default false;

create table if not exists public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  message text not null,
  variables jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) > 0),
  check (length(trim(message)) > 0)
);

create table if not exists public.sms_send_log (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid references public.loans (id) on delete set null,
  installment_id uuid references public.loan_installments (id) on delete set null,
  borrower_name text not null,
  borrower_mobile text not null,
  template_name text not null,
  message text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'dry_run')),
  provider_ref text,
  provider_code integer,
  error_message text,
  triggered_by text not null check (triggered_by in ('manual', 'scheduled')),
  triggered_by_user uuid references public.profiles (id) on delete set null,
  idempotency_key text not null unique,
  scheduled_for date,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sms_send_log_created_idx
  on public.sms_send_log (created_at desc);
create index if not exists sms_send_log_loan_idx
  on public.sms_send_log (loan_id, created_at desc);
create index if not exists sms_send_log_status_idx
  on public.sms_send_log (status, created_at desc);

create table if not exists public.sms_config (
  id integer primary key default 1 check (id = 1),
  dry_run boolean not null default true,
  daily_limit integer not null default 200 check (daily_limit > 0),
  reminder_days_before integer[] not null default '{3,1}',
  escalation_days_after integer[] not null default '{1,3,7}',
  updated_at timestamptz not null default now()
);
insert into public.sms_config (id) values (1) on conflict (id) do nothing;

alter table public.sms_templates enable row level security;
alter table public.sms_send_log enable row level security;
alter table public.sms_config enable row level security;

grant select on public.sms_templates to authenticated;
grant select on public.sms_send_log to authenticated;
grant select, update on public.sms_config to authenticated;
grant all on public.sms_templates, public.sms_send_log, public.sms_config to service_role;

drop policy if exists "staff read active sms templates" on public.sms_templates;
create policy "staff read active sms templates" on public.sms_templates
  for select to authenticated using (active or public.is_admin());
drop policy if exists "admins manage sms templates" on public.sms_templates;
create policy "admins manage sms templates" on public.sms_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff read own sms logs" on public.sms_send_log;
create policy "staff read own sms logs" on public.sms_send_log
  for select to authenticated using (
    triggered_by_user = auth.uid() or public.is_admin() or exists (
      select 1 from public.loans l
      join public.collectors c on c.id = l.collector_id
      where l.id = sms_send_log.loan_id and c.created_by = auth.uid()
    )
  );

drop policy if exists "staff read sms config" on public.sms_config;
create policy "staff read sms config" on public.sms_config
  for select to authenticated using (true);
drop policy if exists "admins update sms config" on public.sms_config;
create policy "admins update sms config" on public.sms_config
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Reserve a send under a transaction-scoped lock so concurrent requests cannot
-- exceed the daily cap or create duplicate scheduled/manual attempts.
create or replace function public.reserve_sms_dispatch(
  p_loan_id uuid,
  p_installment_id uuid,
  p_borrower_name text,
  p_borrower_mobile text,
  p_template_name text,
  p_message text,
  p_triggered_by text,
  p_triggered_by_user uuid,
  p_idempotency_key text,
  p_scheduled_for date,
  p_daily_limit integer
)
returns table (log_id uuid, inserted boolean, limit_exceeded boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('sms_dispatch_daily_limit'));

  select id into existing_id from sms_send_log
  where idempotency_key = p_idempotency_key;
  if existing_id is not null then
    return query select existing_id, false, false;
    return;
  end if;

  if (select count(*) from sms_send_log
      where created_at >= (date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')) >= p_daily_limit then
    return query select null::uuid, false, true;
    return;
  end if;

  insert into sms_send_log (
    loan_id, installment_id, borrower_name, borrower_mobile, template_name,
    message, triggered_by, triggered_by_user, idempotency_key, scheduled_for
  ) values (
    p_loan_id, p_installment_id, p_borrower_name, p_borrower_mobile,
    p_template_name, p_message, p_triggered_by, p_triggered_by_user,
    p_idempotency_key, p_scheduled_for
  ) returning id into new_id;

  return query select new_id, true, false;
end;
$$;
revoke all on function public.reserve_sms_dispatch(uuid, uuid, text, text, text, text, text, uuid, text, date, integer) from public, anon, authenticated;
grant execute on function public.reserve_sms_dispatch(uuid, uuid, text, text, text, text, text, uuid, text, date, integer) to service_role;

insert into public.sms_templates (name, message, variables) values
  ('payment_due', 'Hi {{borrower_name}}, your Jamo Lending payment of PHP {{amount_due}} is due on {{due_date}}. Please contact your collector if you need assistance.', '["borrower_name","amount_due","due_date"]'::jsonb),
  ('payment_overdue', 'Hi {{borrower_name}}, your Jamo Lending payment of PHP {{amount_due}} due on {{due_date}} is overdue. Please contact your collector to discuss payment.', '["borrower_name","amount_due","due_date"]'::jsonb),
  ('overdue_collector', 'Hi {{collector_name}}, {{overdue_count}} installment(s) assigned to you are overdue. Please follow up with the borrowers in your collection.', '["collector_name","overdue_count"]'::jsonb),
  ('loan_maturity', 'Hi {{borrower_name}}, your Jamo Lending loan matures on {{due_date}}. Please contact your collector to confirm the remaining balance and payment arrangements.', '["borrower_name","due_date"]'::jsonb)
on conflict (name) do nothing;
