import { useState } from "react";
import { downloadExcelWorkbook } from "../lib/excelExport";
import type { AmortizationResult, LoanInput } from "../lib/calculator";

interface ExportButtonProps {
  input: LoanInput;
  result: AmortizationResult | null;
}

export function ExportButton({ input, result }: ExportButtonProps) {
  const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");

  const handleClick = async () => {
    if (!result) {
      return;
    }
    setStatus("busy");
    try {
      await downloadExcelWorkbook(input, result);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="export">
      <button
        type="button"
        className="button-primary"
        onClick={handleClick}
        disabled={!result || status === "busy"}
      >
        {status === "busy" ? "Preparing..." : "Print / Export Excel"}
      </button>
      <p className="export-hint">
        {status === "error"
          ? "Export failed. Is the template file available?"
          : "Downloads an editable .xlsx filled with the current loan data and schedule."}
      </p>
    </div>
  );
}