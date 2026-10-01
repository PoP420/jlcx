import type { AmortizationResult, LoanInput } from "./calculator";
import { parseIsoDate } from "./calculator";
import { statementNote } from "./statementNote";

export const FIRST_SCHEDULE_ROW = 19;

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

export interface DateStyles {
  header: number;
  statement: number;
  statementLast: number;
}

interface CellValue {
  style: number;
  text?: string;
  number?: number;
  serial?: number;
  formula?: string;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cell(ref: string, value: CellValue): string {
  const style = ` s="${value.style}"`;
  if (value.formula !== undefined) {
    return `<c r="${ref}"${style}><f>${esc(value.formula)}</f></c>`;
  }
  if (value.number !== undefined) {
    return `<c r="${ref}"${style}><v>${value.number}</v></c>`;
  }
  if (value.serial !== undefined) {
    return `<c r="${ref}"${style}><v>${value.serial}</v></c>`;
  }
  if (value.text !== undefined && value.text !== "") {
    return (
      `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">` +
      `${esc(value.text)}</t></is></c>`
    );
  }
  return `<c r="${ref}"${style}/>`;
}

function noteCell(ref: string, style: number, note: string): string {
  return (
    `<c r="${ref}" s="${style}" t="inlineStr"><is>` +
    `<r><rPr><b/></rPr><t xml:space="preserve">Note</t></r>` +
    `<r><t xml:space="preserve">${esc(note)}</t></r>` +
    `</is></c>`
  );
}

const COLUMNS = "ABCDEFGHIJKLMNOP";

function range(from: string, to: string, index: number, style: number): string[] {
  const cells: string[] = [];
  for (let column = COLUMNS.indexOf(from) + 1; column <= COLUMNS.indexOf(to); column += 1) {
    cells.push(cell(`${COLUMNS[column]}${index}`, { style }));
  }
  return cells;
}

function row(
  index: number,
  cells: string[],
  attributes: { height?: string; thickBottom?: boolean } = {},
): string {
  const height = attributes.height ? ` ht="${attributes.height}" customHeight="1"` : "";
  const thick = attributes.thickBottom ? ` thickBot="1"` : "";
  return `<row r="${index}"${height}${thick}>${cells.join("")}</row>`;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentText(rate: number): string {
  return `: ${Number((rate * 100).toFixed(4))}%`;
}

function dateSerial(iso: string | undefined): number | undefined {
  if (!iso) {
    return undefined;
  }
  const date = parseIsoDate(iso);
  if (!date) {
    return undefined;
  }
  return Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EXCEL_EPOCH_MS) / DAY_MS,
  );
}

function withDateFormat(xf: string): string {
  const patched = /numFmtId="\d+"/.test(xf)
    ? xf.replace(/numFmtId="\d+"/, 'numFmtId="15"')
    : xf.replace(/xfId="0"/, 'numFmtId="15" xfId="0"');
  return /applyNumberFormat="1"/.test(patched)
    ? patched
    : patched.replace(/xfId="0"/, 'applyNumberFormat="1" xfId="0"');
}

const DATE_XF_SOURCES = { header: 3, statement: 21, statementLast: 10 };

function splitCellXfs(body: string): string[] {
  const entries: string[] = [];
  const pattern = /<xf\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    const tagEnd = body.indexOf(">", match.index);
    if (tagEnd === -1) break;
    const selfClosing = body[tagEnd - 1] === "/";
    const end = selfClosing ? tagEnd + 1 : body.indexOf("</xf>", tagEnd) + "</xf>".length;
    if (end <= tagEnd) break;
    entries.push(body.slice(match.index, end));
    pattern.lastIndex = end;
  }

  return entries;
}

export function patchStylesXml(xml: string): { xml: string; styles: DateStyles } {
  const block = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!block) {
    throw new Error("Template is missing its cell styles.");
  }

  const entries = splitCellXfs(block[2]);
  if (entries.length !== Number(block[1])) {
    throw new Error("Template cell styles could not be read.");
  }

  const keys = Object.keys(DATE_XF_SOURCES) as (keyof DateStyles)[];
  const styles = {} as DateStyles;

  keys.forEach((key, index) => {
    styles[key] = entries.length + index;
  });

  const added = keys.map((key) => withDateFormat(entries[DATE_XF_SOURCES[key]])).join("");

  return {
    xml: xml.replace(
      block[0],
      `<cellXfs count="${entries.length + keys.length}">${block[2]}${added}</cellXfs>`,
    ),
    styles,
  };
}

export function buildScheduleRows(
  input: LoanInput,
  result: AmortizationResult,
  dateStyles: DateStyles,
): string[] {
  const termText = `: ${input.termMonths} ${input.termMonths === 1 ? "month" : "months"}`;
  const methodText = input.method === "flat" ? "Flat Rate" : "Diminishing Balance";

  return [
    row(5, [cell("B5", { style: 25, text: "JAMO LENDING CORP." }), ...range("C", "P", 5, 25)]),
    row(6, [
      cell("B6", { style: 26, text: ": Malasila, Makilala, North Cotabato" }),
      ...range("C", "P", 6, 26),
    ]),
    row(7, [cell("B7", { style: 1 })]),
    row(8, [cell("B8", { style: 25, text: "Amortization Schedule" }), ...range("C", "P", 8, 25)]),
    row(9, [cell("B9", { style: 2 })]),
    row(10, [
      cell("B10", { style: 3, text: "Borrower" }),
      ...range("C", "H", 10, 28),
      cell("J10", { style: 3 }),
      cell("K10", { style: 3 }),
      cell("L10", { style: 3, text: "Opened" }),
      cell("M10", { style: dateStyles.header, serial: dateSerial(result.openedDate) }),
      cell("N10", { style: 3 }),
      cell("O10", { style: 28, text: termText }),
      cell("P10", { style: 28 }),
    ]),
    row(11, [
      cell("B11", { style: 3, text: "Address" }),
      ...range("C", "H", 11, 28),
      cell("J11", { style: 3 }),
      cell("K11", { style: 3 }),
      cell("L11", { style: 3, text: "Maturity" }),
      cell("M11", { style: dateStyles.header, serial: dateSerial(result.maturityDate) }),
      cell("N11", { style: 3 }),
      cell("O11", { style: 28 }),
      cell("P11", { style: 28 }),
    ]),
    row(12, [
      cell("B12", { style: 3, text: "Amount" }),
      cell("C12", { style: 28, number: money(input.principal) }),
      cell("D12", { style: 28 }),
      cell("E12", { style: 28 }),
      cell("F12", { style: 28 }),
      cell("G12", { style: 28 }),
      cell("H12", { style: 28 }),
      cell("J12", { style: 3 }),
      cell("K12", { style: 3 }),
      cell("L12", { style: 3, text: "Term" }),
      cell("M12", { style: 3, text: termText }),
      cell("N12", { style: 3 }),
      cell("O12", { style: 28 }),
      cell("P12", { style: 28 }),
    ]),
    row(13, [
      cell("B13", { style: 3, text: "Loan Type" }),
      cell("C13", { style: 28, text: `${percentText(input.monthlyRate)} ${methodText}` }),
      cell("D13", { style: 28 }),
      cell("E13", { style: 28 }),
      cell("F13", { style: 28 }),
      cell("G13", { style: 28 }),
      cell("H13", { style: 28 }),
      cell("J13", { style: 3 }),
      cell("K13", { style: 3 }),
      cell("L13", { style: 3, text: "Rate" }),
      cell("M13", { style: 3, text: percentText(input.monthlyRate) }),
      cell("N13", { style: 3 }),
      cell("O13", { style: 28 }),
      cell("P13", { style: 28 }),
    ]),
    row(14, [cell("B14", { style: 3 })]),
    row(15, [cell("B15", { style: 3 })]),
    row(16, [cell("B16", { style: 3 })], { height: "15", thickBottom: true }),
    row(17, [
      cell("B17", { style: 11 }),
      cell("C17", { style: 34, text: "Payment" }),
      ...range("D", "L", 17, 34),
      cell("M17", { style: 33, text: "Statement of Account" }),
      cell("N17", { style: 34 }),
      cell("O17", { style: 34 }),
      cell("P17", { style: 35 }),
    ]),
    row(18, [
      cell("A18", { style: 4 }),
      cell("B18", { style: 8, text: "No." }),
      cell("C18", { style: 23, text: "Date" }),
      cell("D18", { style: 23 }),
      cell("E18", { style: 25, text: "Principal" }),
      cell("F18", { style: 25 }),
      cell("G18", { style: 25, text: "Interest" }),
      cell("H18", { style: 25 }),
      cell("I18", { style: 25, text: "Payments" }),
      cell("J18", { style: 25 }),
      cell("K18", { style: 2, text: "Penalties" }),
      cell("L18", { style: 12, text: "Total" }),
      cell("M18", { style: 8, text: "Date" }),
      cell("N18", { style: 2, text: "Total Payable" }),
      cell("O18", { style: 36, text: "Bal:" }),
      cell("P18", { style: 37 }),
    ]),
    ...result.rows.map((entry, index) =>
      scheduleRow(FIRST_SCHEDULE_ROW + index, entry, input.termMonths, dateStyles),
    ),
    totalRow(input.termMonths),
    noteRow(input.termMonths, input.penaltyRate),
  ];
}

function scheduleRow(
  current: number,
  entry: AmortizationResult["rows"][number],
  termMonths: number,
  dateStyles: DateStyles,
): string {
  const isLast = current === FIRST_SCHEDULE_ROW + termMonths - 1;
  const style = isLast
    ? {
        C: 31,
        D: 32,
        E: 30,
        F: 30,
        G: 30,
        H: 30,
        I: 30,
        J: 30,
        K: 6,
        L: 15,
        M: dateStyles.statementLast,
        N: 6,
        O: 16,
        P: 17,
      }
    : {
        C: 22,
        D: 23,
        E: 24,
        F: 24,
        G: 24,
        H: 24,
        I: 24,
        J: 24,
        K: 5,
        L: 14,
        M: dateStyles.statement,
        N: 7,
        O: 25,
        P: 29,
      };

  return row(
    current,
    [
      cell(`B${current}`, { style: 13, number: entry.month }),
      cell(`C${current}`, { style: style.C, serial: dateSerial(entry.dueDate) }),
      cell(`D${current}`, { style: style.D }),
      cell(`E${current}`, { style: style.E, number: money(entry.principal) }),
      cell(`F${current}`, { style: style.F }),
      cell(`G${current}`, { style: style.G, number: money(entry.interest) }),
      cell(`H${current}`, { style: style.H }),
      cell(`I${current}`, { style: style.I, formula: `E${current}+G${current}` }),
      cell(`J${current}`, { style: style.J }),
      cell(`K${current}`, {
        style: style.K,
        number: entry.penalty > 0 ? money(entry.penalty) : undefined,
      }),
      cell(`L${current}`, { style: style.L, formula: `I${current}+K${current}` }),
      cell(`M${current}`, { style: style.M, serial: dateSerial(entry.dueDate) }),
      cell(`N${current}`, { style: style.N }),
      cell(`O${current}`, { style: style.O, number: money(entry.closingBalance) }),
      cell(`P${current}`, { style: style.P }),
    ],
    isLast ? { height: "15", thickBottom: true } : {},
  );
}

function totalRow(termMonths: number): string {
  const first = FIRST_SCHEDULE_ROW;
  const last = first + termMonths - 1;
  const current = last + 1;
  return row(current, [
    cell(`C${current}`, { style: 23 }),
    cell(`D${current}`, { style: 23 }),
    cell(`E${current}`, { style: 24, formula: `SUM(E${first}:F${last})` }),
    cell(`F${current}`, { style: 24 }),
    cell(`G${current}`, { style: 24, formula: `SUM(G${first}:H${last})` }),
    cell(`H${current}`, { style: 24 }),
    cell(`I${current}`, { style: 24, formula: `SUM(I${first}:J${last})` }),
    cell(`J${current}`, { style: 24 }),
    cell(`K${current}`, { style: 5, formula: `SUM(K${first}:K${last})` }),
    cell(`L${current}`, { style: 5, formula: `I${current}+K${current}` }),
    cell(`M${current}`, { style: 5, text: "Total" }),
    cell(`N${current}`, { style: 5, formula: `SUM(N${first}:N${last})` }),
    cell(`O${current}`, { style: 3, text: "Total Payable" }),
    cell(`P${current}`, { style: 18, formula: `L${current}-N${current}` }),
  ]);
}

function noteRow(termMonths: number, penaltyRate: number): string {
  const current = FIRST_SCHEDULE_ROW + termMonths + 1;
  return row(
    current,
    [noteCell(`B${current}`, 27, statementNote(penaltyRate)), ...range("C", "P", current, 27)],
    { height: "43.5" },
  );
}

function buildMerges(termMonths: number): string {
  const last = FIRST_SCHEDULE_ROW + termMonths - 1;
  const total = last + 1;
  const note = total + 1;

  const merges = new Set<string>([
    "B5:P5",
    "B6:P6",
    "B8:P8",
    "C10:H10",
    "C11:H11",
    "C12:H12",
    "C13:H13",
    "C17:L17",
    "M17:P17",
    `B${note}:P${note}`,
  ]);

  for (let current = 18; current <= total; current += 1) {
    merges.add(`C${current}:D${current}`);
    merges.add(`E${current}:F${current}`);
    merges.add(`G${current}:H${current}`);
    merges.add(`I${current}:J${current}`);
    merges.add(`O${current}:P${current}`);
  }

  const items = [...merges];
  return `<mergeCells count="${items.length}">${items
    .map((reference) => `<mergeCell ref="${reference}"/>`)
    .join("")}</mergeCells>`;
}

export function patchWorksheetXml(
  xml: string,
  input: LoanInput,
  result: AmortizationResult,
  dateStyles: DateStyles,
): string {
  const note = FIRST_SCHEDULE_ROW + input.termMonths + 1;
  return xml
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A5:P${note}"/>`)
    .replace(
      /<sheetData>[\s\S]*?<\/sheetData>/,
      `<sheetData>${buildScheduleRows(input, result, dateStyles).join("")}</sheetData>`,
    )
    .replace(/<mergeCells[\s\S]*?<\/mergeCells>/, buildMerges(input.termMonths));
}

export function patchWorkbookXml(xml: string, termMonths: number): string {
  const note = FIRST_SCHEDULE_ROW + termMonths + 1;
  return xml.replace(
    /_xlnm\.Print_Area" localSheetId="0">[^<]*</,
    `_xlnm.Print_Area" localSheetId="0">Sheet1!$B$1:$P$${note}<`,
  );
}