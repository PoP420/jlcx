import type { LoanInput } from "./calculator";
import { statementFileName } from "./statementFileName";

export function printStatementPdf(input: LoanInput): void {
  const previousTitle = document.title;
  const restore = () => {
    document.title = previousTitle;
    window.removeEventListener("afterprint", restore);
  };

  document.title = statementFileName(input);
  window.addEventListener("afterprint", restore);

  try {
    window.print();
  } finally {
    restore();
  }
}