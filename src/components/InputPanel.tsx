import type { ReactNode } from "react";
import type { AmortizationMethod, LoanInput } from "../lib/calculator";
import { FIRST_DUE_OPTIONS, MAX_TERM_MONTHS } from "../lib/calculator";

interface InputPanelProps {
  value: LoanInput;
  errors: string[];
  onChange: (value: LoanInput) => void;
  onReset: () => void;
}

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

const METHOD_OPTIONS: { value: AmortizationMethod; label: string; detail: string }[] = [
  { value: "diminishing", label: "Diminishing Balance", detail: "Interest falls as the balance falls" },
  { value: "flat", label: "Flat Rate", detail: "Interest fixed on the original amount" },
];

export function InputPanel({ value, errors, onChange, onReset }: InputPanelProps) {
  const errorFor = (field: string) =>
    errors.find((error) => error.toLowerCase().includes(field)) ?? undefined;

  const set = <K extends keyof LoanInput>(key: K, next: LoanInput[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <section className="panel" aria-labelledby="inputs-heading">
      <div className="panel-header">
        <h2 id="inputs-heading">Loan details</h2>
        <button type="button" className="button-ghost" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="field-grid">
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

        <Field
          id="term"
          label="Term in months (n)"
          hint={`1 to ${MAX_TERM_MONTHS} months`}
          error={errorFor("term")}
        >
          <input
            id="term"
            className="input"
            type="number"
            min={1}
            max={MAX_TERM_MONTHS}
            step={1}
            value={Number.isFinite(value.termMonths) ? value.termMonths : ""}
            onChange={(event) => set("termMonths", Number(event.target.value))}
          />
        </Field>

        <Field
          id="startDate"
          label="Start date"
          hint="Loan release or first deduction date"
          error={errorFor("start date")}
        >
          <input
            id="startDate"
            className="input"
            type="date"
            value={value.startDate}
            onChange={(event) => set("startDate", event.target.value)}
          />
        </Field>

        <Field
          id="firstDue"
          label="First payment"
          hint="When the first installment falls due"
          error={errorFor("first payment")}
        >
          <div className="segmented segmented-inline" role="radiogroup" aria-labelledby="firstDue">
            {FIRST_DUE_OPTIONS.map((offset) => (
              <button
                key={offset}
                type="button"
                role="radio"
                aria-checked={value.firstDueOffsetMonths === offset}
                className={
                  value.firstDueOffsetMonths === offset ? "segment segment-inline active" : "segment segment-inline"
                }
                onClick={() => set("firstDueOffsetMonths", offset)}
              >
                {offset === 0 ? "On start date" : "1 month after"}
              </button>
            ))}
          </div>
        </Field>

        <Field
          id="rate"
          label="Monthly interest rate (r)"
          hint="Enter as a percentage, e.g. 5"
          error={errorFor("monthly interest")}
        >
          <div className="input-affix">
            <input
              id="rate"
              className="input"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={Number.isFinite(value.monthlyRate) ? value.monthlyRate * 100 : ""}
              onChange={(event) => set("monthlyRate", Number(event.target.value) / 100)}
            />
            <span className="affix">%</span>
          </div>
        </Field>

        <Field
          id="penalty"
          label="Penalty rate (p)"
          hint="Applied to an overdue month's total"
          error={errorFor("penalty rate")}
        >
          <div className="input-affix">
            <input
              id="penalty"
              className="input"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={Number.isFinite(value.penaltyRate) ? value.penaltyRate * 100 : ""}
              onChange={(event) => set("penaltyRate", Number(event.target.value) / 100)}
            />
            <span className="affix">%</span>
          </div>
        </Field>
      </div>

      <div className="field">
        <span className="field-label" id="method-label">
          Method
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="method-label">
          {METHOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={value.method === option.value}
              className={value.method === option.value ? "segment active" : "segment"}
              onClick={() => set("method", option.value)}
            >
              <span className="segment-label">{option.label}</span>
              <span className="segment-detail">{option.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}