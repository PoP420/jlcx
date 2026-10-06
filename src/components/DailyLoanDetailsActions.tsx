import { useState } from "react";
import {
  downloadDailyLoanDetailsPdf,
  printDailyLoanDetailsPdf,
} from "../lib/dailyLoanDetailsPdf";
import type { DailyLoanResult } from "../lib/dailyLoanCalculator";

export function DailyLoanDetailsActions({ result }: { result: DailyLoanResult }) {
  const [busy, setBusy] = useState<"download" | "print" | null>(null);
  const [hasError, setHasError] = useState(false);

  const run = async (action: "download" | "print") => {
    setBusy(action);
    setHasError(false);
    try {
      if (action === "download") await downloadDailyLoanDetailsPdf(result);
      else await printDailyLoanDetailsPdf(result);
    } catch {
      setHasError(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="export">
      <div className="export-actions">
        <button
          type="button"
          className="button-primary"
          onClick={() => void run("download")}
          disabled={busy !== null}
        >
          {busy === "download" ? "Preparing..." : "Download Details PDF"}
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => void run("print")}
          disabled={busy !== null}
        >
          {busy === "print" ? "Preparing..." : "Print Details PDF"}
        </button>
      </div>
      <p className={hasError ? "export-hint field-error" : "export-hint"}>
        {hasError
          ? "The loan details PDF could not be prepared. Please try again."
          : "Keeps the complete form; only Loan Details & Financial Summary and Amount Computation are filled."}
      </p>
    </div>
  );
}
