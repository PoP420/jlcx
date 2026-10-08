# Cash Flow & Sidebar Implementation Plan

## Goal
Add a global authenticated sidebar (replacing the top navbar for logged-in users), a Dashboard page that reads real cash data from Supabase, a Cash Count module (cash on hand + releases to borrowers at disbursement), and a Collectors module that feeds into cash tracking. Provide a Supabase SQL schema for the tables.

## Scope
- Authenticated shell: sidebar layout with Dashboard, Amortization, Daily Loan, Cash Count, Collectors.
- Public pages keep the existing top navbar (Amortization, Daily Loan at `/` and `/daily-loan`).
- Login page keeps its own layout.
- Supabase tables: `profiles`, `collectors`, `cash_ledger`, `loans`.

## Tasks
1. SQL schema file with tables + RLS policies.
2. Supabase data access layer (`src/lib/cashService.ts`).
3. `CollectorsPage` component (create/list collectors).
4. `CashCountPage` component (set cash on hand, record release to borrower/collector).
5. `DashboardPage` wired to real cash totals.
6. `Layout.tsx` sidebar with all modules + user footer + Sign Out.
7. Route wiring in `App.tsx` + CSS for new layout.

## Details

### 1. SQL schema (`supabase/migrations/0001_cash_flow.sql`)
Tables:
- `profiles(id uuid pk references auth.users, full_name text, role text, created_at)`
- `collectors(id uuid pk, name text, phone text, active boolean, created_by uuid references profiles, created_at)`
- `loans(id uuid pk, borrower_name text, principal numeric, collector_id uuid references collectors, status text, created_at)`
- `cash_ledger(id uuid pk, collector_id uuid references collectors, loan_id uuid references loans, type text check (release|collection), amount numeric, note text, occurred_on date, created_by uuid references profiles, created_at)`

RLS: enable on all; policies scoped to `auth.uid()` for inserts/select on own rows; admins can read all.

### 2. Data layer (`src/lib/cashService.ts`)
Functions: `fetchCollectors()`, `createCollector(name, phone)`, `fetchCashOnHand(collectorId?)`, `recordCashRelease(collectorId, loanId, amount, note)`, `fetchLedger(collectorId?)`.

### 3. CollectorsPage
- List collectors with name/phone/active.
- Form to add a collector (name, phone).
- Click a collector to filter cash count.

### 4. CashCountPage
- Select a collector (or "All").
- Set starting cash on hand (initial deposit) for the day.
- Record a release: borrower name, loan reference, amount, note.
- Ledger table: date, type, amount, balance running total.
- Balance = starting cash - releases + collections.

### 5. DashboardPage
- Fetch cash on hand per collector, sum for total.
- Active loans count, outstanding balance sum.
- Collections today sum from `cash_ledger` where type=collection and occurred_on=today.

### 6. Layout.tsx
Sidebar items: Dashboard, Amortization, Daily Loan, Cash Count, Collectors.
Footer: user email + role + Sign Out.
Mobile hamburger toggle.

### 7. App.tsx routes
- Public: `/` (Amortization), `/daily-loan`, `/login` — use NavBar.
- Authenticated: wrapped in `<Layout>` with routes `/dashboard`, `/amortization`, `/daily-loan`, `/cash-count`, `/collectors`.
- ProtectedRoute component redirects unauthenticated users to `/login`.

## Validation
- `npm run typecheck` clean.
- `npm run lint` clean.
- `npm run build` succeeds.
- Apply migration in Supabase SQL editor before testing authenticated flows.