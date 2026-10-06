import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  DEFAULT_DAILY_LOAN_INPUT,
  MAX_TERM_MONTHS,
  TERM_OPTIONS,
  calculateDailyLoan,
  type DailyLoanInput,
  validateDailyLoanInput,
} from "../lib/dailyLoanCalculator";
import { formatCurrency, formatDate } from "../lib/calculator";
import { DailyLoanDetailsActions } from "./DailyLoanDetailsActions";

interface FieldProps {
  id: string;
  label: string;
  hint: string;
  error?: string;
  children: ReactNode;
}

function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      <p className={error ? "field-hint field-error" : "field-hint"}>{error ?? hint}</p>
    </div>
  );
}

function ReadOnlyField({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div className="input input-readonly" aria-readonly="true">
        {value}
      </div>
      <p className="field-hint">{hint}</p>
    </div>
  );
}

export function DailyLoanPage() {
  const [input, setInput] = useState<DailyLoanInput>(DEFAULT_DAILY_LOAN_INPUT);

  const errors = useMemo(() => validateDailyLoanInput(input), [input]);
  const isValid = errors.length === 0;
  const result = useMemo(() => (isValid ? calculateDailyLoan(input) : null), [input, isValid]);

  const errorFor = (field: string) =>
    errors.find((error) => error.toLowerCase().includes(field)) ?? undefined;

  const set = <K extends keyof DailyLoanInput>(key: K, next: DailyLoanInput[K]) =>
    setInput({ ...input, [key]: next });

  return (
    <>
      <div className="daily-loan-page">
      <header className="daily-loan-header">
        <p className="brand">Jamo Lending Corp</p>
        <h1 className="title">Short-Term Daily Loan Calculator</h1>
        <p className="subtitle">
          Daily-payment personal loans up to 2 months, with processing fee, rebate, and overdue
          penalty — per the JAMO lending disclosure (RA 3765).
        </p>
        <div className="export-actions">
          {/* Temporarily hidden: complete statement export actions. */}
          {/* {result && <DailyLoanDownloadButton result={result} />} */}
          {/* {result && <DailyLoanPrintButton result={result} />} */}
          {result && <DailyLoanDetailsActions result={result} />}
        </div>
      </header>

      <form
        className="daily-loan-form"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <section className="panel" aria-labelledby="borrower-heading">
          <div className="panel-header">
            <h2 id="borrower-heading">BORROWER INFORMATION</h2>
          </div>
          <div className="field-grid">
            <Field
              id="fullName"
              label="Full Name"
              hint="Borrower's full name as it appears on ID"
              error={errorFor("borrower")}
            >
              <input
                id="fullName"
                className="input"
                type="text"
                placeholder="e.g. Juan Dela Cruz"
                value={input.fullName}
                onChange={(event) => set("fullName", event.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="panel" aria-labelledby="loan-details-heading">
          <div className="panel-header">
            <h2 id="loan-details-heading">LOAN DETAILS &amp; FINANCIAL SUMMARY</h2>
          </div>
          <div className="field-grid">
            <Field
              id="principal"
              label="Loan Amount (P)"
              hint="Original principal borrowed, in PHP"
              error={errorFor("loan amount")}
            >
              <div className="input-affix">
                <input
                  id="principal"
                  className="input"
                  type="number"
                  min={0}
                  step={1000}
                  value={Number.isFinite(input.principal) ? input.principal : ""}
                  onChange={(event) => set("principal", Number(event.target.value))}
                />
                <span className="affix">PHP</span>
              </div>
            </Field>

            <Field
              id="termMonths"
              label="Loan Term"
              hint={`Maximum ${MAX_TERM_MONTHS} months`}
              error={errorFor("term")}
            >
              <div
                className="segmented segmented-inline"
                role="radiogroup"
                aria-labelledby="termMonths"
              >
                {TERM_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={input.termMonths === option}
                    className={
                      input.termMonths === option
                        ? "segment segment-inline active"
                        : "segment segment-inline"
                    }
                    onClick={() => set("termMonths", option)}
                  >
                    {option === 1 ? "1 Month" : "2 Months"}
                  </button>
                ))}
              </div>
            </Field>

            <ReadOnlyField
              label="Interest (10%/mo × months)"
              hint="Flat rate interest on principal"
              value={result ? formatCurrency(result.interest) : formatCurrency(0)}
            />

            <ReadOnlyField
              label="Total (Principal + Interest)"
              hint="Total amount the borrower must repay"
              value={result ? formatCurrency(result.totalDue) : formatCurrency(0)}
            />

            <Field
              id="releaseDate"
              label="Release Date"
              hint="Date the loan is disbursed"
              error={errorFor("release date")}
            >
              <input
                id="releaseDate"
                className="input"
                type="date"
                value={input.releaseDate}
                onChange={(event) => set("releaseDate", event.target.value)}
              />
            </Field>

            <ReadOnlyField
              label="Maturity Date"
              hint="Date the full balance is due"
              value={result ? formatDate(result.maturityDate) : "—"}
            />
          </div>
        </section>

        <section className="panel" aria-labelledby="computation-heading">
          <div className="panel-header">
            <h2 id="computation-heading">AMOUNT COMPUTATION</h2>
          </div>

          <div className="computation-grid">
            <ReadOnlyField
              label="Principal"
              hint="Same as Loan Amount above"
              value={result ? formatCurrency(result.principal) : formatCurrency(0)}
            />

            <ReadOnlyField
              label="Processing Fee (5%)"
              hint="Deducted before release, non-refundable"
              value={result ? formatCurrency(result.processingFee) : formatCurrency(0)}
            />

            <ReadOnlyField
              label="2% Rebate (if qualified)"
              hint={
                (result?.rebateDays ?? 0) > 0
                  ? `2% of principal for each of ${result?.rebateDays} selected day(s)`
                  : "Enter qualifying rebate days below"
              }
              value={result ? formatCurrency(result.rebateAmount) : formatCurrency(0)}
            />

            <Field
              id="prevBalance"
              label="Prev. Balance"
              hint="Amount carried over from a prior loan"
              error={errorFor("previous balance")}
            >
              <div className="input-affix">
                <input
                  id="prevBalance"
                  className="input"
                  type="number"
                  min={0}
                  step={100}
                  value={Number.isFinite(input.prevBalance) ? input.prevBalance : ""}
                  onChange={(event) => set("prevBalance", Number(event.target.value))}
                />
                <span className="affix">PHP</span>
              </div>
            </Field>

            <Field
              id="advPayment"
              label="Adv. Payment"
              hint="Advance payment collected from borrower"
              error={errorFor("advance payment")}
            >
              <div className="input-affix">
                <input
                  id="advPayment"
                  className="input"
                  type="number"
                  min={0}
                  step={100}
                  value={Number.isFinite(input.advPayment) ? input.advPayment : ""}
                  onChange={(event) => set("advPayment", Number(event.target.value))}
                />
                <span className="affix">PHP</span>
              </div>
            </Field>

            <Field
              id="passbookFee"
              label="Passbook Fee"
              hint="Administrative passbook cost"
              error={errorFor("passbook fee")}
            >
              <div className="input-affix">
                <input
                  id="passbookFee"
                  className="input"
                  type="number"
                  min={0}
                  step={10}
                  value={Number.isFinite(input.passbookFee) ? input.passbookFee : ""}
                  onChange={(event) => set("passbookFee", Number(event.target.value))}
                />
                <span className="affix">PHP</span>
              </div>
            </Field>
          </div>

          <div className="computation-summary">
            <ReadOnlyField
              label="NET PROCEEDS TO BORROWER"
              hint="Principal − processing fee + rebate − prev balance + adv payment − passbook fee"
              value={result ? formatCurrency(result.netProceeds) : formatCurrency(0)}
            />

            <ReadOnlyField
              label="Daily Payment Amount"
              hint={`PHP ${result ? formatCurrency(result.totalDue) : 0} ÷ ${result ? result.totalDays : 0} days (rounded up)`}
              value={result ? formatCurrency(result.dailyPaymentRounded) : formatCurrency(0)}
            />
          </div>

          <Field
            id="rebateDays"
            label="Rebate Days"
            hint={`Rebate is 2% of principal per selected day; choose 0 to ${input.termMonths * 30} days.`}
            error={errorFor("rebate days")}
          >
            <input
              id="rebateDays"
              className="input"
              type="number"
              min={0}
              max={input.termMonths * 30}
              step={1}
              value={Number.isFinite(input.rebateDays) ? input.rebateDays : ""}
              onChange={(event) => set("rebateDays", Number(event.target.value))}
            />
          </Field>
        </section>

        {errors.length > 0 && (
          <div className="alert" role="alert">
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </form>

      {result && (
        <section className="result-panel panel" aria-labelledby="result-heading">
          <div className="panel-header">
            <h2 id="result-heading">Calculation Result</h2>
          </div>
          <dl className="result-dl">
            <ResultRow label="Borrower" value={result.fullName} />
            <ResultRow label="Principal" value={formatCurrency(result.principal)} />
            <ResultRow label="Term" value={`${result.termMonths} month(s)`} />
            <ResultRow label="Interest (10%/mo)" value={formatCurrency(result.interest)} />
            <ResultRow label="Total Due" value={formatCurrency(result.totalDue)} tone="primary" />
            <ResultRow label="Release Date" value={formatDate(result.releaseDate)} />
            <ResultRow label="Maturity Date" value={formatDate(result.maturityDate)} />
            <ResultRow label="Processing Fee (5%)" value={formatCurrency(result.processingFee)} />
            <ResultRow label="2% Rebate" value={formatCurrency(result.rebateAmount)} />
            <ResultRow label="Rebate Days" value={String(result.rebateDays)} />
            <ResultRow label="Prev. Balance" value={formatCurrency(result.prevBalance)} />
            <ResultRow label="Advance Payment" value={formatCurrency(result.advPayment)} />
            <ResultRow label="Passbook Fee" value={formatCurrency(result.passbookFee)} />
            <ResultRow
              label="NET PROCEEDS TO BORROWER"
              value={formatCurrency(result.netProceeds)}
              tone="primary"
            />
            <ResultRow label="Total Payment Days" value={String(result.totalDays)} />
            <ResultRow label="Daily Payment (raw)" value={formatCurrency(result.dailyPayment)} />
            <ResultRow
              label="Daily Payment (rounded up)"
              value={formatCurrency(result.dailyPaymentRounded)}
              tone="primary"
            />
          </dl>
        </section>
      )}

      <footer className="footer">
        Figures are estimates in Philippine pesos (PHP) and follow the documented Jamo Lending Corp
        formulas. Overdue penalty of 3%/month applies on the unpaid balance after maturity.
      </footer>
    </div>
    </>
  );
}

function ResultRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "primary" | "neutral";
}) {
  return (
    <div className={`result-row ${tone === "primary" ? "result-row-primary" : ""}`}>
      <dt>{label}</dt>
      <dd className={tone === "primary" ? "result-value-primary" : undefined}>{value}</dd>
    </div>
  );
}
