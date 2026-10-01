export function penaltyPercentText(penaltyRate: number): string {
  return `${Number((penaltyRate * 100).toFixed(4))}%`;
}

export function statementNote(penaltyRate: number): string {
  return (
    `${penaltyPercentText(penaltyRate)} of penalty from the payment total schedule will be given ` +
    `for overdue accounts or if the payor cannot meet the scheduled payment. Any clarrification or ` +
    `updates you may contact us: Contact no. (09120313776) ,FB Account: JAMO LENDING CORP.`
  );
}