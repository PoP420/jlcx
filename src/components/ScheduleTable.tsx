import { useEffect, useState } from "react";
import type { AmortizationResult } from "../lib/calculator";
import { daysBetween, formatCurrency, formatDate, todayIso } from "../lib/calculator";

interface ScheduleTableProps {
  result: AmortizationResult;
  overdueMonths: number[];
  onToggleOverdue: (month: number) => void;
}

export function ScheduleTable({ result, overdueMonths, onToggleOverdue }: ScheduleTableProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const overdueSet = new Set(overdueMonths);
  const today = todayIso();

  useEffect(() => {
    if (!isExpanded) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsExpanded(false);
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isExpanded]);

  const schedule = (
    <div className={isExpanded ? "table-scroll table-scroll-full" : "table-scroll"}>
      <table className="table">
        <thead>
          <tr>
            <th scope="col" className="col-month">
              Month
            </th>
            <th scope="col" className="col-date">
              Due date
            </th>
            <th scope="col">Opening balance</th>
            <th scope="col">Principal</th>
            <th scope="col">Interest</th>
            <th scope="col">Total</th>
            <th scope="col">Penalty</th>
            <th scope="col">Total due</th>
            <th scope="col">Closing balance</th>
            <th scope="col" className="col-flag">
              Overdue
            </th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => {
            const daysLate = daysBetween(row.dueDate, today);
            return (
              <tr key={row.month} className={row.isOverdue ? "row overdue" : "row"}>
                <th scope="row" className="col-month">
                  <span className="month-index">{row.month}</span>
                </th>
                <td className="col-date">
                  <span className="due-date">{formatDate(row.dueDate)}</span>
                  {!row.isOverdue && daysLate > 0 ? (
                    <span className="tag tag-past">{daysLate}d past</span>
                  ) : null}
                  {row.isOverdue ? <span className="tag tag-overdue">Overdue</span> : null}
                </td>
                <td>{formatCurrency(row.openingBalance)}</td>
                <td>{formatCurrency(row.principal)}</td>
                <td>{formatCurrency(row.interest)}</td>
                <td>{formatCurrency(row.total)}</td>
                <td className={row.penalty > 0 ? "cell-penalty" : undefined}>
                  {formatCurrency(row.penalty)}
                </td>
                <td className="cell-due">{formatCurrency(row.totalDue)}</td>
                <td>{formatCurrency(row.closingBalance)}</td>
                <td className="col-flag">
                  <input
                    type="checkbox"
                    className="checkbox"
                    aria-label={`Mark month ${row.month} as overdue`}
                    checked={overdueSet.has(row.month)}
                    onChange={() => onToggleOverdue(row.month)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="col-month">
              Total
            </th>
            <td className="col-date cell-due">{formatDate(result.maturityDate)}</td>
            <td>—</td>
            <td>{formatCurrency(result.totalPrincipal)}</td>
            <td>{formatCurrency(result.totalInterest)}</td>
            <td>{formatCurrency(result.totalPrincipal + result.totalInterest)}</td>
            <td>{formatCurrency(result.totalPenalties)}</td>
            <td className="cell-due">{formatCurrency(result.grandTotal)}</td>
            <td>{formatCurrency(0)}</td>
            <td className="col-flag">—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  if (isExpanded) {
    return (
      <section className="panel table-panel table-panel-expanded" aria-labelledby="schedule-heading-full">
        <div className="panel-header">
          <h2 id="schedule-heading-full">Payment schedule</h2>
          <button type="button" className="button-ghost" onClick={() => setIsExpanded(false)}>
            Close full screen (Esc)
          </button>
        </div>
        {schedule}
      </section>
    );
  }

  return (
    <section className="panel table-panel" aria-labelledby="schedule-heading">
      <div className="panel-header">
        <h2 id="schedule-heading">Payment schedule</h2>
        <div className="panel-actions">
          <p className="panel-note">Tick a month to mark it overdue and apply the penalty.</p>
          <button type="button" className="button-ghost" onClick={() => setIsExpanded(true)}>
            Expand
          </button>
        </div>
      </div>
      {schedule}
    </section>
  );
}