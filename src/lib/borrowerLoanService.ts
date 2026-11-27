import { supabase } from "./supabase";

export type LoanStatus = "active" | "closed" | "written_off";
export type LoanProduct = "daily" | "in_house";

export interface Borrower {
  id: string;
  source_borrower_code: string | null;
  source_system: string;
  full_name: string;
  address: string | null;
  phone: string | null;
  collateral: string | null;
  referral: string | null;
  created_by: string;
  created_at: string;
}

export interface ManagedLoan {
  id: string;
  borrower_id: string | null;
  borrower_name: string;
  borrower_phone: string | null;
  principal: number;
  account_type: LoanProduct;
  status: LoanStatus;
  collector_id: string | null;
  issued_on: string | null;
  due_on: string | null;
  interest_rate: number | null;
  contract_months: number | null;
  amount_paid: number;
  outstanding_balance: number | null;
  processing_fee: number;
  insurance_fee: number;
  notarial_fee: number;
  net_release: number | null;
  remarks: string | null;
  created_at: string;
}

export interface InstallmentInput {
  installment_no: number;
  due_on: string;
  expected_principal: number;
  expected_interest: number;
}

export interface BorrowerInput {
  full_name: string;
  phone: string;
  address: string;
  collateral: string;
  referral: string;
}

export interface LoanInput {
  borrower_id: string;
  borrower_name: string;
  borrower_phone: string;
  principal: number;
  account_type: LoanProduct;
  collector_id: string;
  issued_on: string;
  due_on: string;
  interest_rate: number;
  contract_months: number;
  processing_fee: number;
  insurance_fee: number;
  notarial_fee: number;
  net_release: number;
  outstanding_balance: number;
  remarks: string;
  installments: InstallmentInput[];
  disburse: boolean;
}

export interface RepaymentSummary {
  loan_id: string;
  total: number;
}

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

function resultError<T>(message: string): ServiceResult<T> {
  return { data: null, error: message };
}

export async function fetchBorrowers(): Promise<ServiceResult<Borrower[]>> {
  const { data, error } = await supabase.from("borrowers").select("*").order("full_name");
  if (error) return resultError(error.message);
  return { data: (data ?? []) as unknown as Borrower[], error: null };
}

export async function fetchBorrower(id: string): Promise<ServiceResult<Borrower>> {
  const { data, error } = await supabase.from("borrowers").select("*").eq("id", id).single();
  if (error) return resultError(error.message);
  return { data: data as unknown as Borrower, error: null };
}

export async function saveBorrower(input: BorrowerInput, id?: string): Promise<ServiceResult<Borrower>> {
  const userResult = await supabase.auth.getUser();
  const actor = userResult.data.user?.id;
  if (!actor) return resultError("Not signed in.");
  const values = {
    full_name: input.full_name.trim(),
    phone: input.phone.trim() || null,
    address: input.address.trim() || null,
    collateral: input.collateral.trim() || null,
    referral: input.referral.trim() || null,
  };
  const query = id
    ? supabase.from("borrowers").update(values).eq("id", id)
    : supabase.from("borrowers").insert({ ...values, created_by: actor, source_system: "manual" });
  const { data, error } = await query.select("*").single();
  if (error) return resultError(error.message);
  return { data: data as unknown as Borrower, error: null };
}

export async function removeBorrower(id: string): Promise<ServiceResult<true>> {
  const { error } = await supabase.rpc("delete_managed_borrower", { p_borrower_id: id });
  if (error) return resultError(error.message);
  return { data: true, error: null };
}

export async function fetchLoans(): Promise<ServiceResult<ManagedLoan[]>> {
  const { data, error } = await supabase.from("loans").select("*").order("created_at", { ascending: false });
  if (error) return resultError(error.message);
  return { data: (data ?? []).map((row) => ({
    ...(row as unknown as ManagedLoan),
    principal: Number((row as Record<string, unknown>).principal ?? 0),
    amount_paid: Number((row as Record<string, unknown>).amount_paid ?? 0),
    outstanding_balance: row.outstanding_balance == null ? null : Number(row.outstanding_balance),
    processing_fee: Number(row.processing_fee ?? 0), insurance_fee: Number(row.insurance_fee ?? 0),
    notarial_fee: Number(row.notarial_fee ?? 0), net_release: row.net_release == null ? null : Number(row.net_release),
    interest_rate: row.interest_rate == null ? null : Number(row.interest_rate),
  })), error: null };
}

export async function fetchLoanHistory(): Promise<ServiceResult<RepaymentSummary[]>> {
  const { data, error } = await supabase.from("loan_repayments").select("loan_id, amount");
  if (error) return resultError(error.message);
  const sums = new Map<string, number>();
  for (const row of data ?? []) sums.set(String(row.loan_id), (sums.get(String(row.loan_id)) ?? 0) + Number(row.amount));
  return { data: Array.from(sums, ([loan_id, total]) => ({ loan_id, total })), error: null };
}

export async function createManagedLoan(input: LoanInput): Promise<ServiceResult<string>> {
  const payload = loanPayload(input);
  const { data, error } = await supabase.rpc("create_managed_loan", {
    p_loan: payload,
    p_installments: input.installments,
    p_disburse: input.disburse,
  });
  if (error) return resultError(error.message);
  return { data: String(data), error: null };
}

function loanPayload(input: LoanInput): Record<string, unknown> {
  return {
    borrower_id: input.borrower_id, borrower_name: input.borrower_name,
    borrower_phone: input.borrower_phone || null, principal: input.principal,
    account_type: input.account_type, collector_id: input.collector_id,
    issued_on: input.issued_on, due_on: input.due_on, interest_rate: input.interest_rate,
    contract_months: input.contract_months, processing_fee: input.processing_fee,
    insurance_fee: input.insurance_fee, notarial_fee: input.notarial_fee,
    net_release: input.net_release, outstanding_balance: input.outstanding_balance,
    remarks: input.remarks || null,
  };
}

export async function editManagedLoan(id: string, input: LoanInput): Promise<ServiceResult<true>> {
  const { error } = await supabase.rpc("update_managed_loan", {
    p_loan_id: id, p_loan: loanPayload(input), p_installments: input.installments,
  });
  if (error) return resultError(error.message);
  return { data: true, error: null };
}

export async function updateLoanStatus(id: string, status: LoanStatus): Promise<ServiceResult<true>> {
  const { error } = await supabase.from("loans").update({ status }).eq("id", id);
  if (error) return resultError(error.message);
  return { data: true, error: null };
}

export async function removeLoan(id: string): Promise<ServiceResult<true>> {
  const { error } = await supabase.rpc("delete_managed_loan", { p_loan_id: id });
  if (error) return resultError(error.message);
  return { data: true, error: null };
}
