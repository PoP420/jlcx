import type { LoanInput } from "./calculator";
import { todayIso } from "./calculator";

export function statementFileName(input: LoanInput): string {
  return `jamo-amortization-${Math.round(input.principal)}-${todayIso()}`;
}