# Automated SMS Reminder System — Implementation Plan

## Overview

Send reminders to borrowers and collection staff using Synermaxx MAXXtext. Initial use cases:

- Installment due reminders (for example, three days and one day before due date)
- Overdue notices and collector follow-up
- Loan maturity reminders
- Payment-received confirmations, when a payment is recorded
- Staff-initiated messages to selected loans

**Recommended architecture:** JLC React app (authenticated staff UI) → Supabase Edge Function (authorization, loan selection, templates, idempotency, audit log) → MAXXtext send-message API. Supabase is the application’s loan data source. AppSheet can be integrated later as an event producer if it remains the operational source for any loans; it should not be assumed to be the source of truth or to mirror all loan data.

The current application already uses Supabase Auth, RLS, and service modules, and its database has `loans`, `borrowers`, `collectors`, `loan_installments`, and `loan_repayments`. SMS is not implemented yet. The current UI includes authenticated dashboard and collector pages, but no SMS routes or edge functions.

## 1. Existing Data and Gaps

Current schema in `supabase/migrations/0001_cash_flow.sql` and `0004_loan_portfolio.sql` provides:

| SMS need | Existing source | Notes / gap |
|---|---|---|
| Loan key | `loans.id` (UUID), optionally `source_loan_code` | Use UUID internally; keep external source code for reconciliation. |
| Borrower name / phone | `loans.borrower_name`; `borrowers.full_name`, `borrowers.phone` | Release currently creates a loan without linking a borrower row. Link borrower records or add the required contact field before enabling borrower reminders. |
| Collector name / phone | `loans.collector_id` → `collectors.name`, `collectors.phone` | Phone is optional; validate it before dispatch. |
| Principal / balance / status | `loans.principal`, `outstanding_balance`, `status` | Existing statuses are `active`, `closed`, `written_off`; do not introduce `overdue` without a migration and transition rules. |
| Installment dates / state | `loan_installments.due_on`, `status`, expected/paid principal and interest | Schedule rows can drive due and overdue targeting. Define how partial, waived, and late payments affect the amount shown. |
| Repayment record | `loan_repayments.amount`, `paid_on`, breakdown | Supports payment-confirmation events; define how a repayment is associated with a borrower phone. |

Before building reminder queries, confirm that active loans have borrower contacts and installment schedules. `loans.outstanding_balance` is nullable and not shown being maintained by the existing UI; calculate from schedule/repayment data or establish a reliable update process rather than assuming this value is current. The current app dashboard estimates outstanding principal from cash ledger collections and is not an installment reminder source.

## 2. MAXXtext API Contract (from supplied Synermaxx PDF)

Document: `.kilo/documentations/Api-Documentation/JAMOLENDING_SMS_API_MAXXtext API Document - sendmsg.pdf` (3 pages, “Sample API Call for SMS”).

### 2.1 Send request

| Property | Documented value |
|---|---|
| URL | `https://svr36.synermaxx.asia/api/sendmsg.php` |
| Method | `POST` |
| Content type | `application/json` |
| Authentication | Required `appkey` HTTP header. The PDF contains a credential value; keep it out of this plan, source control, browser code, logs, and examples. Store the reissued/current value only as a Supabase function secret. |
| `mobilenum` | Required recipient number. Document examples allow `63xxxxxxxxx` or `0xxxxxxxxx`; normalize and validate Philippine mobile numbers before calling. |
| `originator` | Required registered sender name. The sample is `JAMOLENDING`; confirm this exact sender is approved for the account. |
| `fullmesq` | Required SMS text. PDF says to URL-encode it. Percent-encode the message text before JSON serialization and confirm this interpretation with Synermaxx in a non-production request, since the example labels the body JSON while also requiring URL encoding. |
| `blackhole` | Optional debug mode: `0` sends at cost (default); `1` blocks sending without cost. Use `1` only for provider-side integration checks; it is distinct from the application’s own dry-run mode. |
| `cost_ctr` | Optional free-text cost center / department tag. |
| `client_outboxnum` | Optional caller-supplied ID tag. Use a unique SMS log/request ID for tracing if the provider accepts it as documented. |
| `format` | Optional response selector: `json` or `pipe`; default is `json`. Always request `json`. |

Example request shape (with a placeholder only; never paste a real key):

```http
POST /api/sendmsg.php HTTP/1.1
Host: svr36.synermaxx.asia
Content-Type: application/json
appkey: <MAXXTEXT_APPKEY>

{
  "mobilenum": "639171234567",
  "originator": "JAMOLENDING",
  "fullmesq": "Hello%20Juan%2C%20your%20payment%20is%20due%20soon.",
  "blackhole": 1,
  "client_outboxnum": "<sms-log-uuid>",
  "format": "json"
}
```

### 2.2 Response handling

The valid sample is JSON with `code: 200`, `status: "ACK"`, `transid`, `txtparts`, `dlr_flag`, `cost_ctr`, `ctr_mobilenum`, `valid_mobilenum`, and `timestamp`. The PDF shows invalid credentials as `code: 401`, `status: "NACK"`, `desc: "Invalid Credentials"`, and an unregistered originator as `code: 400`, `status: "NACK"` with a description. Treat a request as accepted only when the HTTP request succeeds and the parsed JSON has `status === "ACK"` and `code === 200`; persist `transid` as the provider reference and retain sanitized error details for NACKs, malformed responses, timeouts, and network errors. Do not log the `appkey` or full sensitive request headers.

An ACK means the API accepted the send request; the document does not define a delivery callback or guarantee delivery. `dlr_flag` in the sample response is not a documented callback contract. Keep `delivered` as unavailable until Synermaxx supplies and verifies a DLR endpoint and payload specification.

The document does not specify throughput/rate limits, message length/encoding rules, retry semantics, timeout guidance, credit balance APIs, or a DLR webhook. Confirm these with Synermaxx before production. Avoid automatic retries after ambiguous timeouts until duplicate-send behavior and provider idempotency are understood.

### 2.3 Credential handling

- The supplied PDF contains a credential-like `appkey`. Treat it as exposed because it is present in a shared documentation file; ask Synermaxx to revoke/reissue it before production.
- Store the replacement as Supabase secret `MAXXTEXT_APPKEY`. Do not use a `VITE_` variable, `sms_config` row, SQL migration, frontend bundle, AppSheet body, or Git-tracked file for the key.
- Store non-secret deployment configuration separately: `MAXXTEXT_API_URL` (default above) and `MAXXTEXT_ORIGINATOR` (approved sender).
- Keep any AppSheet-to-function shared secret separate from the provider appkey. Never forward either secret to the browser.

## 3. Database Changes (next migration: `0006_sms_reminders.sql`)

Migrations `0001` through `0005` already exist. Continue numbering from `0006`; do not reuse the earlier proposed `0004` migration name.

Create:

- **`sms_templates`**: unique template key, message body, permitted variables, active flag, timestamps, and creator. Restrict write access to admins; allow authorized staff to read active templates.
- **`sms_send_log`**: UUID; nullable `loan_id` UUID FK; nullable `installment_id` UUID FK; recipient name/number snapshot; template key; rendered message; status (`queued`, `sent`, `failed`, `dry_run`); provider `transid`; provider response code; sanitized error; trigger type/user; idempotency key; scheduled date; `sent_at` and creation time. Avoid retaining full message/phone values longer than operational audit needs; define retention and mask numbers in UI.
- **`sms_config`**: singleton settings for app-level dry-run, daily cap, reminder offsets, and escalation offsets. Keep credentials out of this table.

Add uniqueness/locking strategy for idempotency, such as a unique key over `(installment_id, template_key, scheduled_for)` for scheduled reminders, plus an explicit key for manual sends. Add indexes for status/date and loan/installment lookups. Apply RLS consistent with current `public.is_admin()` and ownership via loan collector; only the Edge Function service role may create dispatch records or update provider results. Staff log visibility should be scoped to their loans, with admins able to view all.

Migration review must confirm nullable FK behavior, duplicate prevention, retention, and exact RLS joins before applying to the hosted database.

## 4. Supabase Edge Function (`sms-dispatch`)

Suggested files:

```text
supabase/functions/sms-dispatch/index.ts
supabase/functions/sms-dispatch/maxxtext.ts
supabase/functions/sms-dispatch/templates.ts
supabase/functions/sms-dispatch/types.ts
```

### Dispatch flow

1. Accept authenticated staff requests using the Supabase user JWT and check role/loan access; optionally accept AppSheet calls through a distinct shared-secret authentication path. Validate origin, method, payload size, and input fields.
2. Resolve eligible loans/installments from Supabase on the server. Do not trust client-supplied borrower phone, balance, loan status, or arbitrary message body. For an AppSheet event, resolve the supplied stable loan key against trusted data or explicitly validate its signed source.
3. Select an active template and render only allow-listed variables. Escape/limit values, reject unresolved placeholders, and enforce provider message constraints once confirmed.
4. Validate/normalize the recipient to the provider-supported PH format. Create/reserve an idempotent log entry before the external call. Check the app daily cap atomically to prevent concurrent requests from bypassing it.
5. If application dry-run is enabled, record `dry_run` and do not call MAXXtext. Otherwise POST the documented API payload with `appkey` header, JSON content type, encoded `fullmesq`, approved `originator`, `format: "json"`, and appropriate `client_outboxnum`. Use `blackhole: 1` only for a deliberate provider integration check.
6. Parse HTTP and JSON responses. ACK/code 200 → `sent` with `transid`; NACK, invalid JSON, timeout, or network error → `failed` with sanitized diagnostics. Return per-recipient results, not only a total.
7. Apply bounded timeouts and rate limiting only after Synermaxx confirms allowed throughput. Do not blindly retry ambiguous failures.

Use Supabase Edge Function secrets for `MAXXTEXT_APPKEY`, `MAXXTEXT_API_URL`, `MAXXTEXT_ORIGINATOR`, and optional AppSheet webhook secret. The browser invokes this function through `supabase.functions.invoke`; no provider credential may enter `src/` or Vite env.

## 5. Scheduling and Reminder Rules

Prefer a scheduled server-side job (Supabase Cron/pg_cron or a controlled external scheduler) that calls the Edge Function. First confirm the project’s enabled scheduling facilities and deployment process. Compute dates in `Asia/Manila`, while persisting due/scheduled dates as ISO dates. Query pending installments from `loan_installments`, joined to active loans and borrower contacts; deduplicate per installment and reminder offset. Do not add an AppSheet bot until the data ownership/source integration is confirmed.

Initial rules, configurable offsets, and consent gates:

- Upcoming due: active loan with pending/partial installment at configured offsets (suggested 3 and 1 days before `due_on`).
- Overdue: unpaid/partial installment after `due_on`; apply an escalation cadence only once per cadence window and include collector contact only when present.
- Maturity: send only if distinct from installment due reminders and the loan remains active with a positive calculated balance.
- Borrower reminders require `loans.borrower_sms_consent = true` and `borrower_sms_opted_out = false`; collector escalation requires `collectors.sms_enabled = true` and a valid phone.
- Payment confirmation: triggered after a repayment is committed; calculate remaining balance from authoritative schedule/repayment data.

Set one timezone and define business-day/weekend behavior, late-payment cutoff, partial-payment calculation, opt-out/suppression rules, and quiet hours before enabling scheduled sends.

## 6. App Integration

Follow existing structure: Supabase access belongs in `src/lib/`, protected pages use the authenticated shell in `src/App.tsx`, and role checks use the existing profile role model. Planned additions:

```text
src/lib/smsService.ts
src/components/SmsBlastModal.tsx
src/components/SmsLogPage.tsx
src/components/SmsTemplatesPage.tsx
```

- Add typed service methods for previewing eligible recipients, requesting a manual send, and fetching logs/templates. Handle `{ data, error }` consistently with `cashService.ts`.
- Add an SMS page/route under `ProtectedRoute`; enforce admin-only template/config actions server-side as well as in the UI.
- Add a dashboard action after the UI can preview recipients and message text.
- Require a confirmation summary (recipient count, template, estimated segments/cost if provider confirms billing data), prevent accidental unbounded blasts, and show per-recipient results.
- The existing app has no borrower-management UI and the current `CollectorsPage` only registers collector contacts. Add or complete borrower phone management before manual borrower blasts are exposed.

## 7. Templates

Keep templates concise and parameterized with allow-listed fields such as `borrower_name`, `installment_due_on`, `amount_due`, `outstanding_balance`, `collector_name`, and `collector_phone`. Derive due amounts from the installment/repayment model; do not use placeholder fields absent from the database. Example copy should be reviewed by Jamo Lending operations and should identify the sender clearly. Do not hard-code GCash numbers or payment instructions until verified.

## 8. Security, Privacy, and Operations

- Rotate/reissue the appkey shown in the supplied PDF before production; store only in Edge Function secrets.
- Require authenticated staff for manual sends, validate loan ownership/role, and use a separate high-entropy secret for optional AppSheet webhooks.
- Keep service-role keys and provider credentials server-side; browser uses only the existing Supabase publishable key.
- Restrict logs with RLS; redact credentials, mask phone numbers in tables, and define deletion/retention for PII and rendered message bodies.
- Validate numbers, template variables, request size, daily cap, and opt-out/suppression state before sending.
- Keep application dry-run enabled by default. Provider `blackhole=1` is a separate no-cost provider test and must not be mistaken for a live send.
- Add audit records for actor, trigger, template, recipient loan/installment, provider transaction ID, and outcome. Avoid logging appkey or unnecessary payment details.
- Confirm legal/compliance requirements for consent, transactional/reminder messages, sender registration, opt-outs, quiet hours, and records retention with the business before live sending.

## 9. Implementation Order

| Step | Task | Key outputs |
|---|---|---|
| 1 | Confirm loan/contact/schedule completeness, reminder rules, consent/opt-out, and operational owner | Data and policy decisions |
| 2 | Ask Synermaxx to rotate the exposed appkey; confirm sender approval, encoding, limits, timeout/retry behavior, billing, and DLR | Secure credential and provider answers |
| 3 | Define migration `0006_sms_reminders.sql`, idempotency and RLS from existing schema | Reviewed schema |
| 4 | Implement `sms-dispatch` and MAXXtext client against exact request/response contract | Server-side send path |
| 5 | Deploy function and configure secrets; exercise provider `blackhole=1` and app dry-run separately | Safe integration verification |
| 6 | Add schedule query/trigger and idempotent reminder windows | Scheduled dry-run logs |
| 7 | Add `smsService.ts`, preview/confirmation UI, SMS logs and admin template management | Authenticated app workflows |
| 8 | Reconcile dry-run recipients/messages with operations; test invalid number, NACK, timeout, duplicate, cap, and permissions | Reviewed test evidence |
| 9 | After explicit operational sign-off, send one authorized live test to an internal/consenting number; verify provider ACK and billing | Controlled live verification |
| 10 | Enable gradually and monitor logs, error rate, cost, and opt-outs | Production rollout |

Do not run live tests or enable production sending until the appkey has been rotated and business/provider checks are complete.

## 10. Open Decisions / Provider Follow-up

1. Synermaxx: confirm whether `fullmesq` must be percent-encoded in a JSON string, and the exact accepted mobile-number format.
2. Synermaxx: confirm `JAMOLENDING` is the approved `originator`, and `client_outboxnum` length/uniqueness constraints.
3. Synermaxx: provide rate limits, timeouts, retry/idempotency behavior, message/segment encoding and billing rules, credit inquiry API, and delivery report callback docs (if supported).
4. Jamo Lending: confirm whether Supabase or AppSheet is authoritative for loan/contact data and how external records map to `loans.id` / `source_loan_code`.
5. Jamo Lending: decide consent/opt-out process, quiet hours, escalation cadence, retention period, and who may send manual blasts.

## 11. Implementation Status

The initial app implementation now includes:

- Migration `supabase/migrations/0006_sms_reminders.sql`: borrower phone and consent/opt-out fields, collector SMS permission, templates, send log, app configuration, row-level security, idempotent daily-cap reservation, and starter templates.
- Edge Function `supabase/functions/sms-dispatch`: staff-authenticated manual sends (up to three at a time), scheduled upcoming/overdue installment reminders, opted-in collector escalations, next-day maturity reminders, MAXXtext response handling, and application dry-run (default on).
- `supabase/scheduled_jobs/sms_dispatch_cron.sql`: optional recurring small-batch schedule during 8:00 AM–4:55 PM Manila via Supabase Cron and Vault.
- Protected React screens for sending, recent SMS activity, and admin template/configuration management. Borrower phone and consent can be captured at new loan release; existing loans can have consent recorded or an opt-out applied in the SMS screen. Collector SMS permission can be set when a collector is created.

Still required before hosted use: apply migration 0006; deploy the Edge Function; set `MAXXTEXT_APPKEY`, approved `MAXXTEXT_ORIGINATOR`, optional `MAXXTEXT_API_URL`, and `SMS_CRON_SECRET` as function secrets; enable `pg_cron` and `pg_net`; save the project URL, Supabase publishable key, and matching cron secret in Vault; and schedule the SQL job. The PDF's appkey must be rotated first. Keep `sms_config.dry_run = true` until the provider confirms message encoding/sender registration and dry-run records have been reviewed.

Payment-received confirmations are not wired yet: the current Cash Count collection flow creates generic cash-ledger entries without an associated loan repayment/installment. Implement this after payment recording is linked to `loan_repayments` (or `loan_installments`). Delivery receipts also remain unsupported until Synermaxx provides a callback contract.
