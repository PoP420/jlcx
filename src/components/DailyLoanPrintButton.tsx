import { useState } from "react";
import { printFilledDailyLoanPdf } from "../lib/dailyLoanPdf";
import type { DailyLoanResult } from "../lib/dailyLoanCalculator";

interface PrintButtonProps {
  result: DailyLoanResult;
}

export function DailyLoanPrintButton({ result }: PrintButtonProps) {
  const [isBusy, setIsBusy] = useState(false);

  const handleClick = async () => {
    setIsBusy(true);
    try {
      await printFilledDailyLoanPdf(result);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="export">
      <button
        type="button"
        className="button-secondary"
        onClick={handleClick}
        disabled={isBusy}
      >
        Print / Save as PDF
      </button>
      <p className="export-hint">
        Opens the print dialog; choose &ldquo;Save as PDF&rdquo; for a printable statement.
      </p>
    </div>
  );
}
