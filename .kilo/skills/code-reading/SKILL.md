---
name: code-reading
description: >-
  Teaches the Kilo agent how to efficiently explore, navigate, and understand the JLC Loan
  Calculator codebase. Covers project structure, key files, search patterns, and reading
  strategy. Use before starting any task in this repository.
category: development
metadata:
  suggest_for:
    filename:
      - '*.ts'
      - '*.tsx'
      - 'AGENTS.md'
---

# Code Reading Guide — JLC Loan Calculator

## Project Layout

The active code lives in a git worktree under `.kilo`:

```
C:\Users\ajdpe\projectA\jlcx\.kilo\worktrees\organized-fog/
├── src/
│   ├── App.tsx            # Routing: / → AmortizationPage, /daily-loan → DailyLoanPage
│   ├── main.tsx           # React entry (StrictMode + BrowserRouter)
│   ├── App.css            # Global styles (panels, forms, tables, navbar, daily loan)
│   ├── index.css          # Theme variables + base styles
│   ├── print.css          # Print-specific styles
│   ├── components/        # React components
│   │   ├── NavBar.tsx          # Top nav links (Amortization, Daily Loan)
│   │   ├── InputPanel.tsx      # Amortization input form
│   │   ├── ScheduleTable.tsx   # Amortization schedule table
│   │   ├── SummaryCards.tsx    # Totals cards
│   │   ├── ExportButton.tsx    # Excel export button
│   │   ├── PrintButton.tsx     # Print statement button
│   │   ├── PrintStatement.tsx  # Hidden print-only statement DOM
│   │   ├── DailyLoanPage.tsx   # Daily loan calculator page
│   │   ├── DailyLoanDetailsActions.tsx
│   │   ├── DailyLoanDownloadButton.tsx
│   │   └── DailyLoanPrintButton.tsx
│   └── lib/               # Business logic
│       ├── calculator.ts            # Amortization engine + formatting helpers
│       ├── dailyLoanCalculator.ts   # Daily loan engine + constants
│       ├── excelExport.ts           # XLSX zip/unzip via fflate
│       ├── excelTemplate.ts         # XLSX XML patching for schedule rows
│       ├── printPdf.ts              # Window.print trigger
│       ├── dailyLoanPdf.ts          # Daily loan PDF via pdf-lib
│       ├── dailyLoanDetailsPdf.ts   # Daily loan details PDF via pdf-lib
│       ├── statementNote.ts         # Statement note text (penalty %, contacts)
│       ├── statementFileName.ts     # Exported filename helper
│       └── companyProfile.ts        # Company name, address, contact info
├── public/              # amortization-template.xlsx, daily-loan-template.pdf, favicon.svg
├── vite.config.ts       # Single react() plugin
├── .oxlintrc.json       # react/rules-of-hooks (error), only-export-components (warn)
└── tsconfig.app.json    # target: es2023, lib: ES2023+DOM, verbatimModuleSyntax, noUnusedLocals
```

## Reading Strategy

### Step 1: Understand the App Structure
Start with `src/App.tsx` — it defines the routes and shows which components are used on each page. This tells you:
- `/` → `AmortizationPage` (inline component in App.tsx)
- `/daily-loan` → `DailyLoanPage` (separate component)

### Step 2: Find the Business Logic
The calculation logic lives in `src/lib/`:
- `calculator.ts` — amortization (diminishing balance / flat rate + penalties)
- `dailyLoanCalculator.ts` — daily loan (interest, processing fee, rebate, daily payment)

Read these first when working on calculations.

### Step 3: Trace Data Flow
For any feature, trace the data flow:
1. **Input** — What state/props does the component receive?
2. **Calculation** — What function computes the result?
3. **Output** — How is the result rendered or exported?

Example: For the amortization page:
```
InputPanel → input state → calculateAmortization(input) → result
  → SummaryCards (totals)
  → ScheduleTable (month-by-month rows)
  → ExportButton / PrintButton (exports)
```

### Step 4: Check Documentation
Reference specs in `.kilo/documentations/`:
- `.kilo/documentations/interest-calculation/interest-calculation-jlc.txt` — amortization formula spec
- `.kilo/documentations/short-term-loan-application/calculation-for-daily-loan/` — daily loan spec, sample calculations

### Step 5: Check Future Plans
- `.kilo/plans/` — upcoming feature plans (e.g., cash-flow sidebar with Supabase)

## Search Patterns

Use these patterns with the `grep` tool:

| Goal | Pattern | Files |
|------|---------|-------|
| Find type definitions | `interface \w+` or `type \w+` | `src/lib/*.ts` |
| Find where a function is called | `functionName(` | `src/**/*.ts*` |
| Find where a constant is used | `CONSTANT_NAME` | all `.ts` files |
| Find all exports | `export function`, `export const` | `src/lib/*.ts` |
| Find imports from a module | `from.*calculator` | `src/**/*.ts*` |
| Find CSS class usage | `className="class-name"` | `src/**/*.tsx` |
| Find date handling | `parseIsoDate\|addMonths\|toIsoDate\|todayIso` | all `.ts` files |
| Find currency formatting | `formatCurrency\|currencyFormatter` | all `.ts` files |

## Key Types and Functions Reference

### `calculator.ts`
- `LoanInput` — amortization input (principal, term, rates, method, overdue months, dates)
- `ScheduleRow` — one month in the schedule
- `AmortizationResult` — full result with rows and totals
- `calculateAmortization(input)` — main calculation
- `validateInput(input)` — validation, returns error strings
- `formatCurrency(value)` — PHP formatting
- `formatDate(iso)` — date formatting
- `toIsoDate(date)`, `parseIsoDate(value)`, `addMonths(date, months)`, `todayIso()` — date helpers
- `daysBetween(from, to)` — days between ISO dates
- Constants: `DEFAULT_INPUT`, `MAX_TERM_MONTHS`, `FIRST_DUE_OPTIONS`

### `dailyLoanCalculator.ts`
- `DailyLoanInput` — daily loan input (fullName, principal, term, dates, fees)
- `DailyLoanResult` — daily loan result
- `calculateDailyLoan(input)` — main calculation
- `validateDailyLoanInput(input)` — validation
- Constants: `INTEREST_RATE` (0.1), `PROCESSING_FEE_RATE` (0.05), `REBATE_RATE` (0.02), `DAYS_PER_MONTH` (30), `MAX_TERM_MONTHS` (2), `OVERDUE_PENALTY_RATE` (0.03)

## Project-Specific Paths

All paths are **absolute** (Windows backslash format):

| Area | Path |
|------|------|
| Source root | `C:\Users\ajdpe\projectA\jlcx\.kilo\worktrees\organized-fog\src` |
| Components | `...\src\components` |
| Lib | `...\src\lib` |
| Public assets | `...\public` |
| Worktree root | `C:\Users\ajdpe\projectA\jlcx\.kilo\worktrees\organized-fog` |
| Docs | `C:\Users\ajdpe\projectA\jlcx\.kilo\documentations` |
| Skills | `C:\Users\ajdpe\projectA\jlcx\.kilo\skills` |

## Verification Commands

Always run these after making changes (from the worktree root):

```bash
npm run typecheck   # TypeScript type checking
npm run lint        # Oxlint
npm run build       # Full build (typecheck + vite build)
```
