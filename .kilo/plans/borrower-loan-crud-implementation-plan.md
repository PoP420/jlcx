# Borrower and Loan Management — Implementation Plan

## Goal

Add a modern, authenticated Borrowers and Loans workspace that supports full CRUD, guides staff through borrower intake and loan creation, and keeps schedules, repayments, and cash disbursements linked to the existing Supabase records.

## Current application and schema

The authenticated app uses a React 19 + Vite + TypeScript stack, React Router routes, a shared sidebar layout, and Supabase JS services. The intended workspace path in the supplied instructions (`.kilo/worktrees/organized-fog`) is not present in this checkout; this plan is saved in the active repository root.

Use existing tables and columns from `0001_cash_flow.sql`, `0004_loan_portfolio.sql`, and `0007_jamo_nh_active_accounts.sql`:

- `borrowers`: `id`, `source_borrower_code`, `full_name`, `address`, `phone`, `collateral`, `referral`, `created_by`, `created_at`; `source_system` defaults to `manual`.
- `loans`: existing `borrower_name`, `borrower_phone`, `principal`, `collector_id`, `status`, plus `borrower_id`, `source_loan_code`, `issued_on`, `due_on`, `interest_rate`, `contract_months`, `amount_paid`, `outstanding_balance`, `processing_fee`, `insurance_fee`, `notarial_fee`, `net_release`, `remarks`, and `account_type` (`daily` or `in_house`).
- `loan_installments`: generated schedule and paid amounts/status.
- `loan_repayments`: payment history with principal, interest, penalty, payment date, reference, note, and recorder.
- `cash_ledger`: links a disbursement to `loan_id` and records amount, collector, date, and reference.

The RLS model is based on borrower creator, loan collector ownership (or admin), and recorded-by identity for repayments. Keep the current schema names and ownership model in the UI and service layer.

## Proposed modern workflow

1. **Portfolio overview** — show searchable/filterable borrower and loan lists, portfolio counts, outstanding totals where supported, and a clear primary action (`New borrower` / `Create loan`).
2. **Borrower intake** — guided form with identity and contact details first, then address, collateral, referral, and optional source borrower code. Validate required name and normalize empty optional fields to `null`.
3. **Borrower profile** — show contact details, linked loans, lifecycle/status summaries derived from those loans, and actions to edit, create a loan for this borrower, or delete when safe.
4. **Loan setup** — choose an existing borrower or create one inline; select product (`daily` or `in_house`), collector, principal, dates, rate, contract length, and fees. A review panel previews net release and repayment schedule before save.
5. **Review and confirm** — show borrower, terms, schedule, fees, and disbursement amount. Explicitly confirm the figures, then create the loan, installment rows, and optional cash release as one logical operation.
6. **Loan detail** — show status, balance, terms, schedule, repayment history, and activity. Support editing allowed terms, recording repayments, status changes, and safe deletion/archive behavior.

Keep forms step-based with a progress indicator and save/cancel controls. Use responsive layouts, clear empty/loading/error states, searchable tables, compact status badges, and confirmation dialogs for destructive actions. Reuse the existing Jamo theme and shell rather than introducing a separate visual system.

## CRUD scope and rules

### Borrowers

- **Create:** insert `created_by` from the authenticated user; set `source_system = 'manual'` when applicable.
- **Read:** paginated/searchable directory and profile with linked loans. Search name, phone, source code; filter by having active loans.
- **Update:** edit identity/contact fields. Preserve imported `jamo_nh` data provenance and source borrower code; do not let manual edits change imported source identity.
- **Delete:** offer hard delete only when there are no linked loans. Because `loans.borrower_id` uses `ON DELETE SET NULL`, deletion with history would sever the relationship. Prefer a reversible archive flag if product policy allows a small schema extension; otherwise block deletion for linked borrowers and explain why. Do not silently detach loans.

### Loans

- **Create:** require a borrower, product type, positive principal, and valid terms. Snapshot `borrower_name`/`borrower_phone` in the existing loan fields while setting `borrower_id`; this keeps old screens and exports compatible. Generate installments according to the selected product’s approved calculation rules.
- **Read:** list with borrower, product, status, issued/due dates, principal, and balance; detail includes schedule and repayment history.
- **Update:** edit terms only before material servicing activity. Once repayments exist, preserve the original schedule and payment ledger; require a controlled adjustment flow rather than replacing installment history. Changing borrower or deleting a serviced loan should be disallowed.
- **Delete:** hard delete only for an unserviced draft with no repayment/disbursement ledger history. Since deleting a loan cascades to installments and repayments, active/serviced records should instead transition through supported statuses (`active`, `closed`, `written_off`). If a draft state or soft delete is needed, add it via a forward migration with explicit RLS and UI support; do not silently cascade historic records.

## Implementation phases

### 1. Confirm business rules and schema fit

- Confirm which loan products this module creates (`daily`, `in_house`, or both) and the approved terms/schedule formulas already used by the calculators/import flow.
- Confirm how the current `loans` base columns are constrained and how `collector_id` must be populated for staff-owned loan RLS.
- Decide if borrower archive and loan draft/void states are needed. If needed, add narrowly scoped migration(s), keep imported records intact, and update constraints/policies deliberately.
- Review repayment RLS: current policy is keyed to `recorded_by`; ensure users can only record repayments for loans they can access, and admins retain access.

### 2. Supabase service layer

Add focused typed interfaces and functions in a dedicated `src/lib/borrowerLoanService.ts` (or an agreed extension to `cashService.ts`):

- `fetchBorrowers(filters)` / `fetchBorrower(id)` / `createBorrower(input)` / `updateBorrower(id, input)` / `deleteBorrower(id)`.
- `fetchLoans(filters)` / `fetchLoan(id)` with borrower, collector, installments, and repayments as needed.
- `createLoan(input)` / `updateLoan(id, input)` / `deleteLoan(id)` / `updateLoanStatus(id, status)`.
- Return the app’s established `{data, error}` result shape, convert numeric database values consistently, and surface Supabase errors without hiding constraint/RLS failures.
- Add access helpers only where they avoid duplicating ownership or history checks; enforce critical checks server-side as well.

For loan creation that also inserts installments and a cash release, prefer a Postgres RPC transaction so the loan, schedule, and release ledger are committed or rolled back together. Keep the UI from creating a partial loan if a later insert fails. Align `recordCashRelease` with this flow so cash releases reference the selected borrower and the saved loan rather than creating an unlinked borrowerless loan.

### 3. Borrower directory and profile

- Add authenticated `/borrowers` directory and `/borrowers/:id` profile routes.
- Add a borrower section to the sidebar.
- Build list, create/edit form, profile summary, linked-loan section, and safe delete/archive confirmation.
- Add route-level loading, no-results, empty portfolio, permission, and error states.

### 4. Loan portfolio and creation wizard

- Add `/loans`, `/loans/new`, and `/loans/:id` routes and sidebar entry.
- Implement list filters: product, status, collector, due date/overdue, and borrower search.
- Implement a multi-step wizard: Borrower → Loan terms → Schedule and fees → Review and disbursement.
- Reuse existing calculator logic where product formulas match; document any mismatch before implementation. Store schedule values using the existing installment columns.
- Preview principal, fees, net release, interest/total due, installment amounts, and due dates using PHP formatting.
- Only create `cash_ledger` release entries when the operator confirms disbursement; prevent duplicate release entries on retries.

### 5. Details, editing, and destructive safeguards

- Provide borrower and loan detail pages with clear edit controls.
- Show schedule and repayment details on a loan; reflect derived totals consistently with `loan_repayments` and installments.
- Gate loan editing/deletion based on repayment and cash-ledger activity, with server-side enforcement for rules that protect history.
- Add audit-friendly status changes and confirmation copy; do not represent a closed or written-off loan as deleted.

### 6. Schema and access hardening (only required changes)

- Add a migration only for approved workflow gaps, such as borrower archive / loan draft status or transactional loan creation RPC.
- Preserve existing table/column names, legacy daily loans, import keys, source metadata, and existing RLS behavior.
- Ensure new RPC uses `auth.uid()`, validates ownership/admin access, and has constrained execute grants.
- Revisit borrower and repayment policies so joins, linked records, and create operations are authorized consistently for staff and administrators.

### 7. UX finish and acceptance

- Support keyboard navigation, visible labels, inline validation, unsaved-change handling, and mobile-friendly steps/tables.
- Use consistent date and PHP currency formatting.
- Acceptance: staff can create/edit/search/view borrowers; create loans attached to borrowers; review generated schedules; disburse once with linked cash ledger; view linked loan/payment history; and perform only safe deletes/status changes. Admins can access records per the existing role policy. RLS errors, duplicate submissions, invalid terms, and partial failures are handled clearly.

## Decisions applied during implementation

1. Borrowers with linked loans cannot be hard-deleted; the profile stays linked. Borrowers without loans can be deleted.
2. Both `daily` and `in_house` products are supported. Daily calculations use the existing daily-loan constants; in-house calculations use the existing amortization engine and let staff select flat or diminishing interest.
3. Loan creation saves an active account and offers an explicit disbursement checkbox. The loan, schedule, and optional cash release are created in one database transaction.
4. An active collector is required. Staff can assign loans to their own collectors; administrators can select any active collector.
5. Terms can be edited only before repayment or cash-release activity. Loan deletion is blocked once either history exists; servicing status changes remain available.

## Deployment step

Apply `supabase/migrations/0008_managed_loan_workflow.sql` to the Supabase project before using the new creation and safe-delete flows. The migration adds transactional RPCs and aligns repayment access with loan ownership; no existing tables are recreated.

## Out of scope for this module

- Redesigning existing amortization calculators or the Jamo In-House import process.
- Building a new repayment collection workflow beyond displaying existing repayment records and preserving their history.
- Changing loan calculations without confirming the documented product rules.
