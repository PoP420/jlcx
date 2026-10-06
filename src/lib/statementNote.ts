import { COMPANY } from "./companyProfile";

export function penaltyPercentText(rate: number): string {
  return `${Number((rate * 100).toFixed(4))}%`;
}

export function statementNote(penaltyRate: number): string {
  return (
    `${penaltyPercentText(penaltyRate)} of penalty from the payment total schedule will be given ` +
    `for overdue accounts or if the payor cannot meet the scheduled payment. Any clarrification or ` +
    `updates you may contact us: Contact no. ${COMPANY.phone} ,Email: ${COMPANY.email}`
  );
}

export function statementContactLine(): string {
  return (
    `Address: ${COMPANY.address} | Contact us: ${COMPANY.phone} | ${COMPANY.email} | ` +
    `${COMPANY.socialLabel}:`
  );
}

export function statementContacts(): { label: string; value: string }[] {
  return [
    { label: "Address", value: COMPANY.address },
    { label: "Contact us", value: COMPANY.phone },
    { label: "", value: COMPANY.email },
    { label: COMPANY.socialLabel, value: "" },
  ];
}