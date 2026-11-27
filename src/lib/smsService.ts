import { supabase } from "./supabase";

export type SmsStatus = "queued" | "sent" | "failed" | "dry_run";

export interface SmsTemplate {
  id: string;
  name: string;
  message: string;
  variables: string[];
  active: boolean;
  updated_at: string;
}

export interface SmsLoan {
  id: string;
  borrower_name: string;
  borrower_phone: string | null;
  outstanding_balance: number | null;
  principal: number;
  due_on: string | null;
  amount_due: number | null;
  collector_name: string | null;
  sms_consent: boolean;
  sms_opted_out: boolean;
}

export interface SmsLogEntry {
  id: string;
  loan_id: string | null;
  borrower_name: string;
  borrower_mobile: string;
  template_name: string;
  message: string;
  status: SmsStatus;
  provider_ref: string | null;
  provider_code: number | null;
  error_message: string | null;
  triggered_by: string;
  sent_at: string | null;
  created_at: string;
}

export interface SmsConfig {
  dry_run: boolean;
  daily_limit: number;
  reminder_days_before: number[];
  escalation_days_after: number[];
}

export interface SmsDispatchResult {
  loanId: string;
  status: SmsStatus | "duplicate";
  providerRef?: string;
  providerCode?: number;
  providerStatus?: string;
  providerDescription?: string;
  error?: string;
}

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

export async function fetchSmsLoans(): Promise<ServiceResult<SmsLoan[]>> {
  const { data, error } = await supabase.from("loans")
    .select("id,borrower_name,borrower_phone,borrower_sms_consent,borrower_sms_opted_out,outstanding_balance,principal,due_on,borrower:borrowers(full_name,phone),collector:collectors(name),installments:loan_installments(due_on,expected_principal,expected_interest,principal_paid,interest_paid,status)")
    .eq("status", "active")
    .order("borrower_name");
  if (error) return { data: null, error: error.message };
  return {
    data: (data ?? []).map((row) => {
      const borrower = Array.isArray(row.borrower) ? row.borrower[0] : row.borrower;
      const collector = Array.isArray(row.collector) ? row.collector[0] : row.collector;
      const installment = (Array.isArray(row.installments) ? row.installments : [])
        .filter((item) => item.status === "pending" || item.status === "partial" || item.status === "overdue")
        .sort((left, right) => String(left.due_on).localeCompare(String(right.due_on)))[0];
      const amountDue = installment
        ? Math.max(0, Number(installment.expected_principal) + Number(installment.expected_interest) - Number(installment.principal_paid) - Number(installment.interest_paid))
        : null;
      return {
        id: String(row.id),
        borrower_name: String(borrower?.full_name ?? row.borrower_name),
        borrower_phone: row.borrower_phone != null ? String(row.borrower_phone) : borrower?.phone == null ? null : String(borrower.phone),
        outstanding_balance: row.outstanding_balance == null ? null : Number(row.outstanding_balance),
        principal: Number(row.principal),
        due_on: installment?.due_on == null ? row.due_on == null ? null : String(row.due_on) : String(installment.due_on),
        amount_due: amountDue,
        collector_name: collector && typeof collector === "object" ? String(collector.name) : null,
        sms_consent: Boolean(row.borrower_sms_consent),
        sms_opted_out: Boolean(row.borrower_sms_opted_out),
      };
    }),
    error: null,
  };
}

export async function fetchSmsTemplates(includeInactive = false): Promise<ServiceResult<SmsTemplate[]>> {
  let query = supabase.from("sms_templates")
    .select("id,name,message,variables,active,updated_at").order("name");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map((row) => ({
    id: String(row.id), name: String(row.name), message: String(row.message),
    variables: Array.isArray(row.variables) ? row.variables.map(String) : [],
    active: Boolean(row.active), updated_at: String(row.updated_at),
  })), error: null };
}

export async function saveSmsTemplate(
  template: Omit<SmsTemplate, "id" | "updated_at"> & { id?: string },
): Promise<ServiceResult<SmsTemplate>> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { data: null, error: "Sign in to manage templates." };
  const record = {
    name: template.name.trim(), message: template.message.trim(),
    variables: template.variables, active: template.active,
    updated_at: new Date().toISOString(), created_by: authData.user.id,
  };
  const query = template.id
    ? supabase.from("sms_templates").update(record).eq("id", template.id)
    : supabase.from("sms_templates").insert(record);
  const { data, error } = await query.select("id,name,message,variables,active,updated_at").single();
  if (error) return { data: null, error: error.message };
  return { data: {
    id: String(data.id), name: String(data.name), message: String(data.message),
    variables: Array.isArray(data.variables) ? data.variables.map(String) : [],
    active: Boolean(data.active), updated_at: String(data.updated_at),
  }, error: null };
}

export async function fetchSmsLogs(): Promise<ServiceResult<SmsLogEntry[]>> {
  const { data, error } = await supabase.from("sms_send_log")
    .select("id,loan_id,borrower_name,borrower_mobile,template_name,message,status,provider_ref,provider_code,error_message,triggered_by,sent_at,created_at")
    .order("created_at", { ascending: false }).limit(200);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map((row) => ({
    id: String(row.id), loan_id: row.loan_id == null ? null : String(row.loan_id),
    borrower_name: String(row.borrower_name), borrower_mobile: String(row.borrower_mobile),
    template_name: String(row.template_name), message: String(row.message), status: row.status as SmsStatus,
    provider_ref: row.provider_ref == null ? null : String(row.provider_ref),
    provider_code: row.provider_code == null ? null : Number(row.provider_code),
    error_message: row.error_message == null ? null : String(row.error_message),
    triggered_by: String(row.triggered_by), sent_at: row.sent_at == null ? null : String(row.sent_at),
    created_at: String(row.created_at),
  })), error: null };
}

export async function fetchSmsConfig(): Promise<ServiceResult<SmsConfig>> {
  const { data, error } = await supabase.from("sms_config")
    .select("dry_run,daily_limit,reminder_days_before,escalation_days_after").eq("id", 1).single();
  if (error) return { data: null, error: error.message };
  return { data: {
    dry_run: Boolean(data.dry_run), daily_limit: Number(data.daily_limit),
    reminder_days_before: Array.isArray(data.reminder_days_before) ? data.reminder_days_before.map(Number) : [3, 1],
    escalation_days_after: Array.isArray(data.escalation_days_after) ? data.escalation_days_after.map(Number) : [1, 3, 7],
  }, error: null };
}

export async function saveSmsConfig(
  config: Pick<SmsConfig, "dry_run" | "daily_limit">,
): Promise<ServiceResult<SmsConfig>> {
  const { data, error } = await supabase.from("sms_config")
    .update({ ...config, updated_at: new Date().toISOString() }).eq("id", 1)
    .select("dry_run,daily_limit,reminder_days_before,escalation_days_after").single();
  if (error) return { data: null, error: error.message };
  return { data: {
    dry_run: Boolean(data.dry_run), daily_limit: Number(data.daily_limit),
    reminder_days_before: Array.isArray(data.reminder_days_before) ? data.reminder_days_before.map(Number) : [3, 1],
    escalation_days_after: Array.isArray(data.escalation_days_after) ? data.escalation_days_after.map(Number) : [1, 3, 7],
  }, error: null };
}

export async function updateBorrowerSmsPreference(
  loanId: string,
  consent: boolean,
  optedOut: boolean,
): Promise<ServiceResult<null>> {
  const { error } = await supabase.from("loans").update({
    borrower_sms_consent: consent,
    borrower_sms_opted_out: optedOut,
  }).eq("id", loanId);
  return error ? { data: null, error: error.message } : { data: null, error: null };
}

export async function sendSmsBlast(
  loanIds: string[], templateName: string,
): Promise<ServiceResult<SmsDispatchResult[]>> {
  const { data, error } = await supabase.functions.invoke("sms-dispatch", {
    body: { action: "send", loanIds, templateName },
  });
  if (error) return { data: null, error: error.message };
  if (data?.error) return { data: null, error: String(data.error) };
  return { data: (data?.results ?? []) as SmsDispatchResult[], error: null };
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length < 7 ? "••••" : `${digits.slice(0, 4)}••••${digits.slice(-3)}`;
}

