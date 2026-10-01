export type AmortizationMethod = "diminishing" | "flat";

export interface LoanInput {
  principal: number;
  termMonths: number;
  monthlyRate: number;
  penaltyRate: number;
  method: AmortizationMethod;
  overdueMonths: number[];
  startDate: string;
  firstDueOffsetMonths: number;
}

export interface ScheduleRow {
  month: number;
  startDate: string;
  dueDate: string;
  openingBalance: number;
  principal: number;
  interest: number;
  total: number;
  penalty: number;
  totalDue: number;
  closingBalance: number;
  isOverdue: boolean;
}

export interface AmortizationSummary {
  totalPrincipal: number;
  totalInterest: number;
  totalPenalties: number;
  grandTotal: number;
}

export interface AmortizationResult extends AmortizationSummary {
  monthlyPrincipal: number;
  monthlyInterestConstant: number | null;
  openedDate: string;
  maturityDate: string;
  rows: ScheduleRow[];
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const isExact =
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day);

  return isExact ? date : null;
}

export function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export const DEFAULT_INPUT: LoanInput = {
  principal: 100_000,
  termMonths: 9,
  monthlyRate: 0.05,
  penaltyRate: 0.06,
  method: "diminishing",
  overdueMonths: [],
  startDate: todayIso(),
  firstDueOffsetMonths: 1,
};

export const MAX_TERM_MONTHS = 600;
export const FIRST_DUE_OPTIONS = [0, 1] as const;

export function validateInput(input: LoanInput): string[] {
  const errors: string[] = [];

  if (!Number.isFinite(input.principal) || input.principal <= 0) {
    errors.push("Loan amount must be greater than zero.");
  }

  if (
    !Number.isInteger(input.termMonths) ||
    input.termMonths < 1 ||
    input.termMonths > MAX_TERM_MONTHS
  ) {
    errors.push(`Term must be a whole number of months between 1 and ${MAX_TERM_MONTHS}.`);
  }

  if (!Number.isFinite(input.monthlyRate) || input.monthlyRate < 0 || input.monthlyRate > 1) {
    errors.push("Monthly interest rate must be between 0% and 100%.");
  }

  if (
    !Number.isFinite(input.penaltyRate) ||
    input.penaltyRate < 0 ||
    input.penaltyRate > 1
  ) {
    errors.push("Penalty rate must be between 0% and 100%.");
  }

  if (parseIsoDate(input.startDate) === null) {
    errors.push("Start date must be a valid calendar date.");
  }

  if (
    !Number.isInteger(input.firstDueOffsetMonths) ||
    input.firstDueOffsetMonths < 0 ||
    input.firstDueOffsetMonths > FIRST_DUE_OPTIONS[FIRST_DUE_OPTIONS.length - 1]
  ) {
    errors.push("First payment must fall on the start date or one month after it.");
  }

  const outOfRange = input.overdueMonths.filter(
    (month) => month < 1 || month > input.termMonths,
  );
  if (outOfRange.length > 0) {
    errors.push("Overdue months must fall within the loan term.");
  }

  return errors;
}

export function calculateAmortization(input: LoanInput): AmortizationResult {
  const { principal, termMonths, monthlyRate, penaltyRate, method } = input;
  const overdue = new Set(input.overdueMonths);
  const startDate = parseIsoDate(input.startDate) ?? new Date();

  const monthlyPrincipal = principal / termMonths;
  const flatInterest = principal * monthlyRate;
  const monthlyInterestConstant = method === "flat" ? flatInterest : null;

  const rows: ScheduleRow[] = [];
  let balance = principal;
  let totalPrincipal = 0;
  let totalInterest = 0;
  let totalPenalties = 0;

  for (let month = 1; month <= termMonths; month += 1) {
    const openingBalance = balance;
    const interest = method === "flat" ? flatInterest : openingBalance * monthlyRate;
    const total = monthlyPrincipal + interest;
    const isOverdue = overdue.has(month);
    const penalty = isOverdue ? total * penaltyRate : 0;
    const closingBalance = month === termMonths ? 0 : Math.max(openingBalance - monthlyPrincipal, 0);

    rows.push({
      month,
      startDate: input.startDate,
      dueDate: toIsoDate(addMonths(startDate, input.firstDueOffsetMonths + month - 1)),
      openingBalance,
      principal: monthlyPrincipal,
      interest,
      total,
      penalty,
      totalDue: total + penalty,
      closingBalance,
      isOverdue,
    });

    totalPrincipal += monthlyPrincipal;
    totalInterest += interest;
    totalPenalties += penalty;
    balance = closingBalance;
  }

  const lastRow = rows[rows.length - 1];

  return {
    monthlyPrincipal,
    monthlyInterestConstant,
    openedDate: toIsoDate(startDate),
    maturityDate: lastRow.dueDate,
    rows,
    totalPrincipal,
    totalInterest,
    totalPenalties,
    grandTotal: totalPrincipal + totalInterest + totalPenalties,
  };
}

export const CURRENCY = "PHP";

export const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: CURRENCY,
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-PH", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(rate: number): string {
  return percentFormatter.format(Number.isFinite(rate) ? rate : 0);
}

export function formatDate(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  return date ? dateFormatter.format(date) : "—";
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}