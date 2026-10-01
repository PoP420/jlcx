import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { patchStylesXml, patchWorkbookXml, patchWorksheetXml } from "./excelTemplate";
import type { AmortizationResult, LoanInput } from "./calculator";

const TEMPLATE_URL = `${import.meta.env.BASE_URL}amortization-template.xlsx`;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function withoutCalcChain(files: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const next: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(files)) {
    if (path === "xl/calcChain.xml") {
      continue;
    }
    if (path === "[Content_Types].xml") {
      next[path] = strToU8(strFromU8(data).replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, ""));
      continue;
    }
    if (path === "xl/_rels/workbook.xml.rels") {
      next[path] = strToU8(strFromU8(data).replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/g, ""));
      continue;
    }
    next[path] = data;
  }
  return next;
}

export function buildWorkbookFiles(
  template: Record<string, Uint8Array>,
  input: LoanInput,
  result: AmortizationResult,
): Record<string, Uint8Array> {
  const files = withoutCalcChain(template);
  const patchedStyles = patchStylesXml(strFromU8(files["xl/styles.xml"]));
  files["xl/styles.xml"] = strToU8(patchedStyles.xml);
  files["xl/worksheets/sheet1.xml"] = strToU8(
    patchWorksheetXml(
      strFromU8(files["xl/worksheets/sheet1.xml"]),
      input,
      result,
      patchedStyles.styles,
    ),
  );
  files["xl/workbook.xml"] = strToU8(patchWorkbookXml(strFromU8(files["xl/workbook.xml"]), input.termMonths));
  return files;
}

export async function createExcelWorkbook(input: LoanInput, result: AmortizationResult): Promise<Blob> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error("Could not load the amortization template.");
  }
  const template = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const files = buildWorkbookFiles(template, input, result);
  return new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: XLSX_MIME });
}

export async function downloadExcelWorkbook(input: LoanInput, result: AmortizationResult): Promise<void> {
  const blob = await createExcelWorkbook(input, result);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `jamo-amortization-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}