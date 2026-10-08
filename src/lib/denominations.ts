export const DENOMINATIONS = [1000, 500, 200, 100, 50, 5, 1] as const;

export type DenominationCounts = Record<string, number>;

export function emptyDenominationCounts(): DenominationCounts {
  return Object.fromEntries(DENOMINATIONS.map((denom) => [String(denom), 0]));
}

export function countsTotal(counts: DenominationCounts): number {
  return DENOMINATIONS.reduce(
    (sum, denom) => sum + (counts[String(denom)] ?? 0) * denom,
    0,
  );
}

/**
 * Breaks an amount into denominations drawn from the available
 * bills, using the largest bills first. Returns null when the
 * amount cannot be formed from what is on hand.
 */
export function segregateAmount(
  amount: number,
  available: DenominationCounts,
): DenominationCounts | null {
  const breakdown = emptyDenominationCounts();
  let remaining = amount;

  for (const denom of DENOMINATIONS) {
    const have = Math.max(0, Math.floor(available[String(denom)] ?? 0));
    const used = Math.min(have, Math.floor(remaining / denom));
    breakdown[String(denom)] = used;
    remaining -= used * denom;
  }

  return remaining === 0 ? breakdown : null;
}

export function formatDenominations(counts: DenominationCounts): string {
  return DENOMINATIONS.filter((denom) => (counts[String(denom)] ?? 0) > 0)
    .map((denom) => `${counts[String(denom)]}×₱${denom.toLocaleString("en-PH")}`)
    .join(" + ");
}
