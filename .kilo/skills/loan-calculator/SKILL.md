---
name: loan-calculator
description: >-
  Implements the Jamo Lending Corp loan calculation formulas used in this project — amortization
  (diminishing balance and flat rate) with overdue penalties, and short-term daily loans with
  processing fee, rebate, and daily payment rounding. Use when building or modifying the
  calculation engine or adding new loan types.
category: development
metadata:
  suggest_for:
    filename:
      - 'calculator.ts'
      - 'dailyLoanCalculator.ts'
      - '*.calculator.ts'
---

# Loan Calculator Formulas

## Overview

This project implements two loan calculators following Jamo Lending Corp (JLC) formulas:

1. **Amortization Calculator** — monthly installment loans with two methods and overdue penalties.
2. **Daily Loan Calculator** — short-term daily-payment loans (1–2 months) with processing fee,
   rebate, and daily rounding.

All amounts are in Philippine Pesos (PHP).

---

## 1. Amortization Calculator (`src/lib/calculator.ts`)

### Input

| Field                   | Type                              | Description                              |
|-------------------------|-----------------------------------|------------------------------------------|
| `principal`             | `number`                          | Loan amount (P)                          |
| `termMonths`            | `number`                          | Term in months (n)                       |
| `monthlyRate`           | `number`                          | Monthly interest rate (r), e.g. `0.05`   |
| `penaltyRate`           | `number`                          | Penalty rate (p) on overdue total      |
| `method`                | `"diminishing" \| "flat"`         | Amortization method                      |
| `overdueMonths`         | `number[]`                        | Months marked overdue                    |
| `startDate`             | `string` (ISO)                    | Loan start date                          |
| `firstDueOffsetMonths`  | `number`                          | 0 = first payment on start date, 1 = 1 month after |

### Defaults

```typescript
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
```

### Method A: Diminishing Balance (Equal Principal)

Principal payment is constant; interest decreases on the declining balance.

```
Monthly Principal (Mp)   = P / n
Interest (month i)      = B(i-1) × r       where B(0) = P
Total Payable (i)       = Mp + Interest(i)
Closing Balance (i)     = B(i-1) - Mp      (0 for final month)
```

### Method B: Flat Rate

Interest is constant on the original principal for all months.

```
Monthly Principal (Mp)   = P / n
Interest (constant)     = P × r
Total Payable (constant)= Mp + Interest
```

### Penalty Calculation (both methods)

```
Penalty (month i)       = Total(i) × p      (only if month is overdue)
Total Due (month i)     = Total(i) + Penalty(i)
```

### Summary Totals

```
Total Principal Paid  = Σ Mp            (for all months)
Total Interest Paid   = Σ Interest(i)    (for all months)
Total Penalties       = Σ Penalty(i)    (for all months)
Grand Total Payable   = Total Principal + Total Interest + Total Penalties
```

### Due Date Calculation

```
Due Date (month i) = addMonths(startDate, firstDueOffsetMonths + month - 1)
```

### Key Code Reference

- `calculateAmortization` in `calculator.ts:139` — main calculation function
- `validateInput` in `calculator.ts:90` — input validation

---

## 2. Daily Loan Calculator (`src/lib/dailyLoanCalculator.ts`)

### Input

| Field         | Type     | Description                                      |
|---------------|----------|--------------------------------------------------|
| `fullName`    | `string` | Borrower's full name                             |
| `principal`   | `number` | Loan amount (P)                                  |
| `termMonths`  | `number` | Term: 1 or 2 months                              |
| `releaseDate` | `string` | ISO date of loan disbursement                    |
| `rebateDays`  | `number` | Number of rebate days (0 to termMonths × 30)    |
| `prevBalance` | `number` | Previous balance carried over                    |
| `advPayment`  | `number` | Advance payment collected                        |
| `passbookFee` | `number` | Passbook fee                                     |

### Constants

```typescript
export const INTEREST_RATE = 0.1;        // 10% per month
export const PROCESSING_FEE_RATE = 0.05; // 5% of principal, non-refundable
export const REBATE_RATE = 0.02;         // 2% of principal per rebate day
export const DAYS_PER_MONTH = 30;        // Standard PH microfinance
export const MAX_TERM_MONTHS = 2;
export const OVERDUE_PENALTY_RATE = 0.03; // 3% per month on unpaid balance after maturity
```

### Formulas

```
Interest          = P × (10% × termMonths)
Total Due         = P + Interest
Processing Fee    = P × 5%
Rebate Amount     = P × 2% × rebateDays
Maturity Date     = addMonths(releaseDate, termMonths)
Net Proceeds      = P − Processing Fee + Rebate Amount − Prev Balance + Adv Payment − Passbook Fee
Total Days        = termMonths × 30
Daily Payment     = Total Due / Total Days
Daily Payment (rounded up) = ceil(Daily Payment)
```

### Sample Calculation (P=10,000, term=2 months)

```
Interest    = 10,000 × (0.10 × 2) = 2,000
Total Due   = 10,000 + 2,000      = 12,000
Proc. Fee   = 10,000 × 0.05       = 500
Net Proceeds= 10,000 − 500 + 0 − 0 + 0 − 0 = 9,500
Total Days  = 2 × 30              = 60
Daily Pay   = 12,000 / 60          = 200
```

### Defaults

```typescript
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
```

### Key Code Reference

- `calculateDailyLoan` in `dailyLoanCalculator.ts:89` — main calculation function
- `validateDailyLoanInput` in `dailyLoanCalculator.ts:54` — input validation

---

## Legal Context

This calculator follows the JAMO lending disclosure (RA 3765 — Truth in Lending Act).
The daily loan page subtitle states: "Daily-payment personal loans up to 2 months, with
processing fee, rebate, and overdue penalty — per the JAMO lending disclosure (RA 3765)."
