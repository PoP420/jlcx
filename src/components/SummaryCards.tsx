import type { AmortizationResult } from "../lib/calculator";
import { formatCurrency, formatPercent } from "../lib/calculator";

interface SummaryCardsProps {
  result: AmortizationResult;
  penaltyRate: number;
  overdueCount: number;
}

export function SummaryCards({ result, penaltyRate, overdueCount }: SummaryCardsProps) {
  const cards = [
    { label: "Total principal", value: formatCurrency(result.totalPrincipal), tone: "neutral" },
    { label: "Total interest", value: formatCurrency(result.totalInterest), tone: "neutral" },
    {
      label: "Total penalties",
      value: formatCurrency(result.totalPenalties),
      tone: result.totalPenalties > 0 ? "warning" : "neutral",
      hint:
        overdueCount > 0
          ? `${overdueCount} overdue ${overdueCount === 1 ? "month" : "months"} at ${formatPercent(penaltyRate)}`
          : "No overdue months",
    },
    { label: "Grand total payable", value: formatCurrency(result.grandTotal), tone: "primary" },
  ] as const;

  return (
    <section className="cards" aria-label="Schedule summary">
      {cards.map((card) => (
        <article key={card.label} className={`card card-${card.tone}`}>
          <h3 className="card-label">{card.label}</h3>
          <p className="card-value">{card.value}</p>
          {"hint" in card && card.hint ? <p className="card-hint">{card.hint}</p> : null}
        </article>
      ))}
    </section>
  );
}