import { useState } from "react";
import { printStatementPdf } from "../lib/printPdf";
import type { AmortizationResult, LoanInput } from "../lib/calculator";

interface PrintButtonProps {
  input: LoanInput;
  result: AmortizationResult | null;
}

export function PrintButton({ input, result }: PrintButtonProps) {
  const [isBusy, setIsBusy] = useState(false);

  const handleClick = () => {
    if (!result) {
      return;
    }
    setIsBusy(true);
    printStatementPdf(input);
    setIsBusy(false);
  };

  return (
    <div className="export">
      <button
        type="button"
        className="button-secondary"
        onClick={handleClick}
        disabled={!result || isBusy}
      >
        Print / Save as PDF
      </button>
      <p className="export-hint">
        Opens the print dialog; choose &ldquo;Save as PDF&rdquo; for a printable statement.
      </p>
    </div>
  );
}