import { addMonths, parseIsoDate, todayIso, toIsoDate } from "./calculator";

export const INTEREST_RATE = 0.1;
export const PROCESSING_FEE_RATE = 0.05;
export const REBATE_RATE = 0.02;
export const DAYS_PER_MONTH = 30;
export const MAX_TERM_MONTHS = 2;
export const OVERDUE_PENALTY_RATE = 0.03;

export interface DailyLoanInput {
  fullName: string;
  principal: number;
  termMonths: number;
  releaseDate: string;
  rebateDays: number;
  prevBalance: number;
  advPayment: number;
  passbookFee: number;
}

export interface DailyLoanResult {
  fullName: string;
  principal: number;
  termMonths: number;
  interest: number;
  totalDue: number;
  releaseDate: string;
  maturityDate: string;
  processingFee: number;
  rebateAmount: number;
  rebateDays: number;
  prevBalance: number;
  advPayment: number;
  passbookFee: number;
  netProceeds: number;
  totalDays: number;
  dailyPayment: number;
  dailyPaymentRounded: number;
}

export const DEFAULT_DAILY_LOAN_INPUT: DailyLoanInput = {
  fullName: "",
  principal: 10_000,
  termMonths: 2,
  releaseDate: todayIso(),
  rebateDays: 0,
  prevBalance: 0,
  advPayment: 0,
  passbookFee: 0,
};

export const TERM_OPTIONS = [1, 2] as const;

export function validateDailyLoanInput(input: DailyLoanInput): string[] {
  const errors: string[] = [];

  if (!Number.isFinite(input.principal) || input.principal <= 0) {
    errors.push("Loan amount must be greater than zero.");
  }

  if (!Number.isInteger(input.termMonths) || !TERM_OPTIONS.includes(input.termMonths as (typeof TERM_OPTIONS)[number])) {
    errors.push("Term must be 1 or 2 months.");
  }

  if (parseIsoDate(input.releaseDate) === null) {
    errors.push("Release date must be a valid calendar date.");
  }

  const rebateDayLimit = input.termMonths * DAYS_PER_MONTH;
  if (!Number.isInteger(input.rebateDays) || input.rebateDays < 0 || input.rebateDays > rebateDayLimit) {
    errors.push(`Rebate days must be between 0 and ${rebateDayLimit}.`);
  }

  if (!Number.isFinite(input.prevBalance) || input.prevBalance < 0) {
    errors.push("Previous balance cannot be negative.");
  }

  if (!Number.isFinite(input.advPayment) || input.advPayment < 0) {
    errors.push("Advance payment cannot be negative.");
  }

  if (!Number.isFinite(input.passbookFee) || input.passbookFee < 0) {
    errors.push("Passbook fee cannot be negative.");
  }

  return errors;
}

export function calculateDailyLoan(input: DailyLoanInput): DailyLoanResult {
  const { principal, termMonths, rebateDays, releaseDate, prevBalance, advPayment, passbookFee } = input;

  const interest = principal * INTEREST_RATE * termMonths;
  const totalDue = principal + interest;

  const processingFee = principal * PROCESSING_FEE_RATE;
  const totalDays = termMonths * DAYS_PER_MONTH;
  const rebateAmount = principal * REBATE_RATE * rebateDays;

  const netProceeds = principal - processingFee + rebateAmount - prevBalance + advPayment - passbookFee;

  const dailyPayment = totalDue / totalDays;
  const dailyPaymentRounded = Math.ceil(dailyPayment);

  const release = parseIsoDate(releaseDate) ?? new Date();
  const maturity = addMonths(release, termMonths);

  return {
    fullName: input.fullName,
    principal,
    termMonths,
    interest,
    totalDue,
    releaseDate: toIsoDate(release),
    maturityDate: toIsoDate(maturity),
    processingFee,
    rebateAmount,
    rebateDays,
    prevBalance,
    advPayment,
    passbookFee,
    netProceeds,
    totalDays,
    dailyPayment,
    dailyPaymentRounded,
  };
}
