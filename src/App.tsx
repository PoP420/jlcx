import { useMemo, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import "./print.css";
import { InputPanel } from "./components/InputPanel";
import { ScheduleTable } from "./components/ScheduleTable";
import { SummaryCards } from "./components/SummaryCards";
import { ExportButton } from "./components/ExportButton";
import { PrintButton } from "./components/PrintButton";
import { PrintStatement } from "./components/PrintStatement";
import { NavBar } from "./components/NavBar";
import { DailyLoanPage } from "./components/DailyLoanPage";
import {
  DEFAULT_INPUT,
  calculateAmortization,
  formatCurrency,
  formatDate,
  validateInput,
  type LoanInput,
} from "./lib/calculator";

function AmortizationPage() {
  const [input, setInput] = useState<LoanInput>(DEFAULT_INPUT);

  const errors = useMemo(() => validateInput(input), [input]);
  const isValid = errors.length === 0;
  const result = useMemo(
    () => (isValid ? calculateAmortization(input) : null),
    [input, isValid],
  );

  const toggleOverdue = (month: number) => {
    setInput((current) => ({
      ...current,
      overdueMonths: current.overdueMonths.includes(month)
        ? current.overdueMonths.filter((value) => value !== month)
        : [...current.overdueMonths, month].sort((a, b) => a - b),
    }));
  };

  return (
    <>
      <div className="app">
        <header className="masthead">
          <p className="brand">Jamo Lending Corp</p>
          <h1 className="title">Loan Amortization Calculator</h1>
          <p className="subtitle">
            Diminishing balance and flat rate schedules, with penalty handling for overdue payments.
          </p>
          <div className="export-actions">
            <ExportButton input={input} result={result} />
            <PrintButton input={input} result={result} />
          </div>
        </header>

        <main className="layout">
          <InputPanel
            value={input}
            errors={errors}
            onChange={setInput}
            onReset={() => setInput(DEFAULT_INPUT)}
          />

          <div className="results">
            {errors.length > 0 && (
              <div className="alert" role="alert">
                <ul>
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {result && (
              <>
                <dl className="timeline" aria-label="Loan dates">
                  <div className="timeline-item">
                    <dt>Opened</dt>
                    <dd>{formatDate(result.openedDate)}</dd>
                  </div>
                  <div className="timeline-step" aria-hidden="true" />
                  <div className="timeline-item">
                    <dt>First due</dt>
                    <dd>{formatDate(result.rows[0].dueDate)}</dd>
                  </div>
                  <div className="timeline-step" aria-hidden="true" />
                  <div className="timeline-item">
                    <dt>Maturity</dt>
                    <dd>{formatDate(result.maturityDate)}</dd>
                  </div>
                </dl>

                <SummaryCards
                  result={result}
                  penaltyRate={input.penaltyRate}
                  overdueCount={input.overdueMonths.length}
                />

                <p className="equation-note">
                  {input.method === "diminishing" ? (
                    <>
                      Monthly principal <span className="mono">{formatCurrency(result.monthlyPrincipal)}</span>,
                      interest calculated on the declining balance.
                    </>
                  ) : (
                    <>
                      Monthly principal <span className="mono">{formatCurrency(result.monthlyPrincipal)}</span> +
                      flat interest{" "}
                      <span className="mono">
                        {formatCurrency(result.monthlyInterestConstant ?? 0)}
                      </span>
                      .
                    </>
                  )}
                </p>

                <ScheduleTable
                  result={result}
                  overdueMonths={input.overdueMonths}
                  onToggleOverdue={toggleOverdue}
                />
              </>
            )}
          </div>
        </main>

        <footer className="footer">
          Figures are estimates in Philippine pesos (PHP) and follow the documented Jamo Lending Corp
          formulas.
        </footer>
      </div>

      {result && <PrintStatement input={input} result={result} />}
    </>
  );
}

function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<AmortizationPage />} />
        <Route path="/daily-loan" element={<DailyLoanPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
