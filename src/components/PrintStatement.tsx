import { formatCurrency, formatDate } from "../lib/calculator";
import type { AmortizationResult, LoanInput } from "../lib/calculator";
import { penaltyPercentText, statementNote } from "../lib/statementNote";

interface PrintStatementProps {
  input: LoanInput;
  result: AmortizationResult;
}

export function PrintStatement({ input, result }: PrintStatementProps) {
  const methodText = input.method === "flat" ? "Flat Rate" : "Diminishing Balance";
  const termText = `${input.termMonths} ${input.termMonths === 1 ? "month" : "months"}`;

  const meta: [string, string][] = [
    ["Borrower", ""],
    ["Address", ""],
    ["Amount", formatCurrency(input.principal)],
    ["Loan Type", `${penaltyPercentText(input.monthlyRate)} ${methodText}`],
    ["Opened", formatDate(result.openedDate)],
    ["Maturity", formatDate(result.maturityDate)],
    ["Term", termText],
    ["Rate", penaltyPercentText(input.monthlyRate)],
  ];

  return (
    <div className="print-root" aria-hidden="true">
      <article className="print-sheet">
        <header className="print-banner">
          <h1 className="print-company">JAMO LENDING CORP.</h1>
          <p className="print-address">: Malasila, Makilala, North Cotabato</p>
        </header>

        <h2 className="print-title">Amortization Schedule</h2>

        <dl className="print-meta">
          {meta.map(([label, value]) => (
            <div className="print-meta-item" key={label}>
              <dt>{label}</dt>
              <dd>{value || " "}</dd>
            </div>
          ))}
        </dl>

        <table className="print-table">
          <thead>
            <tr>
              <th scope="col">No.</th>
              <th scope="col">Date</th>
              <th scope="col">Principal</th>
              <th scope="col">Interest</th>
              <th scope="col">Payments</th>
              <th scope="col">Penalties</th>
              <th scope="col">Total</th>
              <th scope="col">Bal:</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.month} className={row.isOverdue ? "print-row print-row-overdue" : "print-row"}>
                <td className="print-num">{row.month}</td>
                <td className="print-num">{formatDate(row.dueDate)}</td>
                <td className="print-num">{formatCurrency(row.principal)}</td>
                <td className="print-num">{formatCurrency(row.interest)}</td>
                <td className="print-num">{formatCurrency(row.total)}</td>
                <td className="print-num">{formatCurrency(row.penalty)}</td>
                <td className="print-num print-strong">{formatCurrency(row.totalDue)}</td>
                <td className="print-num">{formatCurrency(row.closingBalance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="print-label">Total</td>
              <td />
              <td className="print-num">{formatCurrency(result.totalPrincipal)}</td>
              <td className="print-num">{formatCurrency(result.totalInterest)}</td>
              <td className="print-num">{formatCurrency(result.totalPrincipal + result.totalInterest)}</td>
              <td className="print-num">{formatCurrency(result.totalPenalties)}</td>
              <td className="print-num print-strong">{formatCurrency(result.grandTotal)}</td>
              <td className="print-num">{formatCurrency(0)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="print-note">
          <strong>Note</strong>: {statementNote(input.penaltyRate)}
        </p>
      </article>
    </div>
  );
}