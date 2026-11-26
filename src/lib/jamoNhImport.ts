export interface JamoNhImportRow {
  client_id: string;
  loan_id: string | null;
  import_key: string;
  source_row: number;
  full_name: string;
  address: string | null;
  phone: string | null;
  collateral: string | null;
  referral: string | null;
  issued_on: string;
  due_on: string;
  principal: number;
  net_release: number | null;
  monthly_principal: number;
  monthly_interest: number;
  contract_months: number;
  months_paid: number | null;
  total_interest: number | null;
  principal_paid: number | null;
  interest_paid: number | null;
  principal_balance: number | null;
  accumulated_penalties: number | null;
  total_paid: number | null;
  total_balance: number | null;
  account_status: string | null;
  due_status: string | null;
  remarks: string | null;
}

export interface JamoNhImportIssue {
  row: number;
  message: string;
}

export interface JamoNhCsvPreview {
  rows: JamoNhImportRow[];
  issues: JamoNhImportIssue[];
  warnings: JamoNhImportIssue[];
}

const HEADER_ALIASES: Record<string, string> = {
  "client s collateral": "collateral",
  "clients refference": "referral",
  "client id": "client_id",
  "loan id": "loan_id",
  "client address": "address",
  "mobile number": "phone",
  "date opened of the accounts": "issued_on",
  fullname: "full_name",
  "principal in monthly": "monthly_principal",
  "interest in monthly": "monthly_interest",
  "total principal amount": "principal",
  "exact release": "net_release",
  "no. of months in contract": "contract_months",
  "no. of months paid": "months_paid",
  "total interest": "total_interest",
  "total principal paid": "principal_paid",
  "total principal balance": "principal_balance",
  "total interest paid": "interest_paid",
  "acc penalties": "accumulated_penalties",
  "total payment": "total_paid",
  "total balance": "total_balance",
  "account status": "account_status",
  "due/overdue status": "due_status",
  "due date": "due_on",
  remarks: "remarks",
};

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ").toLowerCase();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((item) => item.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    if (row.some((item) => item.trim() !== "")) rows.push(row);
  }
  return rows;
}

function parseAmount(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "-" || trimmed.toLowerCase() === "n/a") return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[₱$ ,()]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

function parseInteger(value: string | undefined): number | null {
  const amount = parseAmount(value);
  return amount !== null && Number.isInteger(amount) ? amount : null;
}

function validIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const parts = /^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2}|\d{4})$/.exec(trimmed);
  if (!parts) return null;
  const day = Number(parts[1]);
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(parts[2].toLowerCase()) + 1;
  const rawYear = Number(parts[3]);
  const year = parts[3].length === 2 ? (rawYear < 70 ? 2000 + rawYear : 1900 + rawYear) : rawYear;
  return validIsoDate(year, month, day);
}

function optionalText(value: string | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

export function parseJamoNhActiveCsv(text: string): JamoNhCsvPreview {
  const records = parseCsv(text);
  if (records.length < 2) throw new Error("The CSV must include a header and at least one account.");

  const indexes = new Map<string, number>();
  records[0].map(normalizeHeader).forEach((header, index) => {
    const mapped = HEADER_ALIASES[header];
    if (mapped && !indexes.has(mapped)) indexes.set(mapped, index);
  });

  const requiredColumns = ["client_id", "full_name", "issued_on", "due_on", "principal", "monthly_principal", "monthly_interest", "contract_months"];
  const missing = requiredColumns.filter((key) => !indexes.has(key));
  if (missing.length > 0) {
    throw new Error("Missing required CSV columns: " + missing.join(", ") + ".");
  }

  const issues: JamoNhImportIssue[] = [];
  const warnings: JamoNhImportIssue[] = [];
  const rows: JamoNhImportRow[] = [];
  const importKeys = new Set<string>();
  const value = (record: string[], key: string) => {
    const index = indexes.get(key);
    return index === undefined ? undefined : record[index];
  };

  records.slice(1).forEach((record, index) => {
    const sourceRow = index + 2;
    const clientId = optionalText(value(record, "client_id"));
    const loanId = optionalText(value(record, "loan_id"));
    const fullName = optionalText(value(record, "full_name"));
    const issuedOn = parseDate(value(record, "issued_on"));
    const dueOn = parseDate(value(record, "due_on"));
    const principal = parseAmount(value(record, "principal"));
    const netRelease = parseAmount(value(record, "net_release"));
    const monthlyPrincipal = parseAmount(value(record, "monthly_principal"));
    const monthlyInterest = parseAmount(value(record, "monthly_interest"));
    const contractMonths = parseInteger(value(record, "contract_months"));
    const importKey = loanId
      ? "jamo_nh_active:loan:" + loanId
      : clientId ? "jamo_nh_active:client:" + clientId + ":row:" + sourceRow : "jamo_nh_active:row:" + sourceRow;
    const rowIssues: string[] = [];

    if (!clientId) rowIssues.push("Client ID is required.");
    if (!fullName) rowIssues.push("Full name is required.");
    if (!issuedOn) rowIssues.push("Opened date is missing or invalid.");
    if (!dueOn) rowIssues.push("Due date is missing or invalid.");
    if (principal === null || principal <= 0) rowIssues.push("Total principal amount must be a positive number.");
    if ((value(record, "net_release")?.trim() ?? "") !== "" && netRelease === null) warnings.push({ row: sourceRow, message: "Exact release is not a valid number; it will be left blank." });
    if (monthlyPrincipal === null || monthlyPrincipal < 0) rowIssues.push("Monthly principal must be a valid non-negative number.");
    if (monthlyInterest === null || monthlyInterest < 0) rowIssues.push("Monthly interest must be a valid non-negative number.");
    if (contractMonths === null || contractMonths <= 0) rowIssues.push("Contract months must be a positive whole number.");

    if (importKeys.has(importKey)) rowIssues.push("This source loan ID appears more than once in the CSV.");
    importKeys.add(importKey);

    const amount = (key: string) => parseAmount(value(record, key));
    const integer = (key: string) => parseInteger(value(record, key));
    const monthsPaid = integer("months_paid");
    const totalInterest = amount("total_interest");
    const principalPaid = amount("principal_paid");
    const interestPaid = amount("interest_paid");
    const principalBalance = amount("principal_balance");
    const penalties = amount("accumulated_penalties");
    const totalPaid = amount("total_paid");
    const totalBalance = amount("total_balance");

    const optionalNumberChecks: [string, string, number | null][] = [
      ["Months paid", "months_paid", monthsPaid],
      ["Total interest", "total_interest", totalInterest],
      ["Principal paid", "principal_paid", principalPaid],
      ["Interest paid", "interest_paid", interestPaid],
      ["Principal balance", "principal_balance", principalBalance],
      ["Accumulated penalties", "accumulated_penalties", penalties],
      ["Total payment", "total_paid", totalPaid],
      ["Total balance", "total_balance", totalBalance],
    ];
    for (const [label, key, parsed] of optionalNumberChecks) {
      const original = value(record, key)?.trim() ?? "";
      if (original !== "" && original !== "-" && parsed === null) {
        warnings.push({ row: sourceRow, message: label + " is not a valid number; it will be left blank." });
      }
    }

    if (rowIssues.length > 0) {
      rowIssues.forEach((message) => issues.push({ row: sourceRow, message }));
      return;
    }

    rows.push({
      client_id: clientId!,
      loan_id: loanId,
      import_key: importKey,
      source_row: sourceRow,
      full_name: fullName!,
      address: optionalText(value(record, "address")),
      phone: optionalText(value(record, "phone")),
      collateral: optionalText(value(record, "collateral")),
      referral: optionalText(value(record, "referral")),
      issued_on: issuedOn!,
      due_on: dueOn!,
      principal: principal!,
      net_release: netRelease,
      monthly_principal: monthlyPrincipal!,
      monthly_interest: monthlyInterest!,
      contract_months: contractMonths!,
      months_paid: monthsPaid,
      total_interest: totalInterest,
      principal_paid: principalPaid,
      interest_paid: interestPaid,
      principal_balance: principalBalance,
      accumulated_penalties: penalties,
      total_paid: totalPaid,
      total_balance: totalBalance,
      account_status: optionalText(value(record, "account_status")),
      due_status: optionalText(value(record, "due_status")),
      remarks: optionalText(value(record, "remarks")),
    });
  });

  return { rows, issues, warnings };
}





