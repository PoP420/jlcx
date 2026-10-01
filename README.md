# Jamo Lending Corp — Loan Amortization Calculator

React + Vite calculator implementing the Jamo Lending Corp loan amortization specification
(`.kilo/documentations/interest-calculation/interest-calculation-jlc.txt`). All amounts are formatted in
Philippine pesos (PHP).

## Formulas

| Symbol | Meaning | Default |
| --- | --- | --- |
| `P` | Loan amount (principal) | `100,000` |
| `n` | Term in months | `9` |
| `r` | Monthly interest rate | `5%` |
| `p` | Penalty rate | `6%` |

**Method A — Diminishing balance**: `M_p = P / n`, `I_i = B_(i-1) × r`, `T_i = M_p + I_i`,
`B_i = B_(i-1) - M_p`.

**Method B — Flat rate**: `M_p = P / n`, `I = P × r` (constant), `T = M_p + I`.

**Penalty (either method)**: `Pen_i = T_i × p` for an overdue month, `Total_i = T_i + Pen_i`.

**Totals**: sum of principal, interest and penalties across the term; grand total is their sum.

## Dates

- **Start date** — loan release / first deduction date (defaults to today).
- **First payment** — either on the start date or one month after it.
- Each installment gets a **due date**, clamped to the last valid day of short months
  (a 31st start date falls on 28/29 Feb, then returns to the 31st).
- **Maturity** is the due date of the final installment; installments already past
  their due date are tagged in the schedule.
- The Excel export writes the opened date, maturity date, and every installment and
  statement date from the same schedule.

## Scripts

```bash
npm run dev        # start the dev server
npm run build      # typecheck and build for production
npm run typecheck  # TypeScript only
npm run lint       # oxlint
npm run preview    # serve the production build
```

## Structure

- `src/lib/calculator.ts` — calculation engine, input validation and formatting
- `src/components/InputPanel.tsx` — loan inputs and method selection
- `src/components/SummaryCards.tsx` — totals for the term
- `src/components/ScheduleTable.tsx` — month-by-month schedule with overdue toggles and a full-screen view (Esc to exit)