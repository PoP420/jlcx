---
name: react-vite
description: >-
  Project-specific coding patterns for the JLC Loan Calculator — a React 19 + Vite 8 +
  TypeScript 6 + oxlint application. Use when building or modifying UI components,
  calculation logic, or project tooling in this codebase.
category: development
metadata:
  suggest_for:
    filename:
      - '*.tsx'
      - '*.ts'
      - 'vite.config.*'
      - 'package.json'
---

# React + Vite (JLC Loan Calculator)

## Project Overview

The JLC Loan Calculator is a React 19 + Vite 8 + TypeScript 6 single-page application
that computes loan amortization schedules and short-term daily loans using Jamo Lending Corp
formulas. Linting is done with Oxlint.

## Tooling

### Package scripts (`package.json`)

| Script        | Command            | Purpose                        |
|---------------|--------------------|--------------------------------|
| `dev`         | `vite`             | Start dev server               |
| `build`       | `tsc -b && vite build` | Type-check then build        |
| `lint`        | `oxlint`           | Run linter                     |
| `typecheck`   | `tsc -b --noEmit`  | Type-check without emitting    |
| `preview`     | `vite preview`     | Preview production build       |

### Vite config (`vite.config.ts`)

```typescript
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
})
```

### Oxlint (`oxlintrc.json`)

Rules configured:
- `react/rules-of-hooks`: `error`
- `react/only-export-components`: `warn` (allows `allowConstantExport`)

Always run `npm run lint` and `npm run typecheck` after changes.

## Project Structure

```
src/
  App.tsx                    # App shell, routing, layout
  main.tsx                   # React entry point
  index.css                  # Global styles
  App.css                    # Application styles
  print.css                  # Print-specific styles
  components/                # React components
    InputPanel.tsx           # Loan input form (amortization)
    ScheduleTable.tsx        # Amortization schedule table
    SummaryCards.tsx         # Summary totals cards
    ExportButton.tsx         # Excel export button
    PrintButton.tsx          # Print statement button
    PrintStatement.tsx       # HTML print statement
    NavBar.tsx               # Navigation bar
    DailyLoanPage.tsx        # Daily loan calculator page
    DailyLoanDetailsActions.tsx  # PDF download/print actions
    DailyLoanDownloadButton.tsx  # Daily loan PDF download
    DailyLoanPrintButton.tsx     # Daily loan print button
  lib/                       # Business logic
    calculator.ts            # Amortization calculation engine
    dailyLoanCalculator.ts   # Daily loan calculation engine
    excelExport.ts           # XLSX export via fflate
    excelTemplate.ts         # XLSX template patching
    printPdf.ts              # PDF print generation
    dailyLoanPdf.ts          # Daily loan PDF generation
    dailyLoanDetailsPdf.ts   # Daily loan details PDF
    statementNote.ts         # Statement note text helpers
    statementFileName.ts     # Statement filename helper
    companyProfile.ts        # Company profile constants
public/                      # Static assets
```

## React Component Patterns

### Functional components with typed props

Always use function declarations, not arrow consts:

```typescript
export function ComponentName({ prop }: ComponentProps) {
  return ( <div>...</div> );
}
```

### Interface for props

Define props as an interface, export it if needed by parent:

```typescript
interface ComponentProps {
  value: LoanInput;
  errors: string[];
  onChange: (value: LoanInput) => void;
}
```

### State management

Use `useState` for local state, `useMemo` for derived/computed values:

```typescript
const [input, setInput] = useState<LoanInput>(DEFAULT_INPUT);
const errors = useMemo(() => validateInput(input), [input]);
const result = useMemo(() => isValid ? calculateAmortization(input) : null, [input, isValid]);
```

### Event handlers

Use descriptive names, handle both success and error states:

```typescript
const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");

const handleClick = async () => {
  setStatus("busy");
  try {
    await downloadExcelWorkbook(input, result);
    setStatus("idle");
  } catch {
    setStatus("error");
  }
};
```

### Field pattern

Reusable form field components use `id`, `label`, `hint`, `error`, and `children`:

```tsx
<Field
  id="principal"
  label="Loan amount (P)"
  hint="Original principal borrowed, in PHP"
  error={errorFor("loan amount")}
>
  <input
    id="principal"
    className="input"
    type="number"
    min={0}
    step={1000}
    value={Number.isFinite(value.principal) ? value.principal : ""}
    onChange={(event) => set("principal", Number(event.target.value))}
  />
</Field>
```

### Accessibility

- Use `aria-label`, `aria-labelledby`, `aria-describedby`, `aria-checked`, `role="radiogroup"`
- Use `role="alert"` for error messages
- Use `aria-hidden="true"` for print-only DOM elements
- Use `<th scope="col">` and `<th scope="row">` for table headers
- Use `<dl>`, `<dt>`, `<dd>` for definition lists (timeline, results)

## Currency & Formatting

All currency is Philippine Peso (PHP), formatted via `Intl.NumberFormat("en-PH", ...)`:

```typescript
export const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}
```

## Date Handling

Dates use ISO 8601 strings (`YYYY-MM-DD`). Use the helper functions from `calculator.ts`:

- `toIsoDate(date: Date): string` — convert Date to ISO string
- `parseIsoDate(value: string): Date | null` — parse ISO string to Date
- `addMonths(date: Date, months: number): Date` — add months with month-end clamping
- `todayIso(): string` — today's date as ISO string
- `daysBetween(fromIso: string, toIso: string): number` — days between two dates

Never use `Date` directly in components; always go through these helpers.
