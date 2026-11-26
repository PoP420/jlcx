# Jamo In-House Active Accounts Import Plan

## Goal
Import the provided active in-house monthly accounts as a distinct loan type, preserving the account-level balances and source metadata without recording them as new daily cash releases or inventing transaction history.

## Current findings
- The existing loan portfolio has borrowers, generic loans, installment and repayment tables, but loans have no product/account type.
- New daily cash releases create generic active loans and cash-ledger releases.
- The CSV contains 119 active rows. Client IDs repeat, Loan ID is often blank, and the file contains account-level totals rather than individual payment transactions.
- The current codebase is at the repository root; the AGENTS.md-described nested worktree is not present in this checkout.

## Implementation
1. Add an idempotent Supabase migration:
   - Add explicit `daily` / `in_house` account type, defaulting legacy loans to daily.
   - Add source import key and fields for the in-house monthly amounts, balances, statuses, and months paid.
   - Add borrower source metadata and a unique import key for repeat-safe row upserts.
   - Add an administrator-only transactional RPC that creates/updates borrowers and loans, never cash-ledger entries or fabricated installment/repayment rows.
2. Add CSV parsing and preview:
   - Support quoted CSV fields, BOM, comma-delimited numbers and the date format in the supplied CSV.
   - Map source headers to database fields, validate required fields and values, and show all row errors before allowing import.
   - Use source loan IDs when present; where absent, use source client ID plus the original CSV row number as a stable key for re-importing the same file.
3. Add a protected administrator page:
   - Upload the CSV, preview valid/error rows, import only when every row passes validation, and show inserted/updated totals.
   - Place the entry in the Administration sidebar and guard the RPC at the database layer.
4. Keep account categories distinct:
   - Mark cash release-created loans as daily.
   - Add a database backfill so existing loans remain daily.
   - Do not infer monthly payment history from paid-to-date totals; retain those as imported summary fields.

## Implementation status
- [x] Wrote the plan before coding.
- [x] Added separate daily and in-house loan types with repeat-safe Supabase import RPC.
- [x] Added CSV parsing, preview, row validation, and optional-value warnings.
- [x] Added an administrator-only import page and navigation entry.
- [x] Kept daily cash release, dashboard totals, and SMS recipient selection scoped to daily accounts.
- [x] Added a database guard preventing staff from promoting their own profile to administrator.
- [ ] Apply migration 0007 to the configured Supabase project and submit the CSV from the admin page.
## Rollout
- Apply the new Supabase migration before using the page.
- Sign in as an administrator and import the CSV. The RPC is atomic and repeat imports update by source key.
- Verify the report shows all 119 records and review key principal, payment, and balance totals against the source workbook.

## Known limitation
Rows without a loan ID use CSV row position as part of their stable key. Re-importing the same ordered file is safe; if a future source file is reordered or restructured, compare/resolve its records before importing it as a new snapshot.



