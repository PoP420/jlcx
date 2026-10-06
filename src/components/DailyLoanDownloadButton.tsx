import { useState } from "react";
import { downloadFilledDailyLoanPdf } from "../lib/dailyLoanPdf";
import type { DailyLoanResult } from "../lib/dailyLoanCalculator";

interface DownloadButtonProps {
  result: DailyLoanResult;
}

export function DailyLoanDownloadButton({ result }: DownloadButtonProps) {
  const [status, setStatus] = useState<"idle" | "busy" | "loading" | "error">("idle");

  const handleClick = async () => {
    setStatus("loading");
    try {
      setStatus("busy");
      await downloadFilledDailyLoanPdf(result);
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
        disabled={status === "busy" || status === "loading"}
      >
        {status === "loading"
          ? "Loading..."
          : status === "busy"
            ? "Preparing..."
            : "Download Statement"}
      </button>
      <p className="export-hint">
        {status === "error"
          ? "Download failed. Please try again."
          : "Downloads the completed one-page loan application as a PDF."}
      </p>
    </div>
  );
}
