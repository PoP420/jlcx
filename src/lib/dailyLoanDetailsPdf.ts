import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import type { DailyLoanResult } from "./dailyLoanCalculator";
import { formatDate } from "./calculator";

const TEMPLATE_URL = `${import.meta.env.BASE_URL}daily-loan-template.pdf`;
const PAGE_HEIGHT = 1008;

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  width: number,
  black: RGB,
  size = 9,
  align: "left" | "right" = "left",
): void {
  const safeText = text.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\x20-\x7E]/g, "");
  if (!safeText) return;
  const fontSize = Math.max(7, Math.min(size, width / font.widthOfTextAtSize(safeText, 1)));
  const textWidth = font.widthOfTextAtSize(safeText, fontSize);
  const textX = align === "right" ? x + width - textWidth : x;
  page.drawText(safeText, { x: textX, y, size: fontSize, font, color: black });
}

export async function createDailyLoanDetailsPdf(result: DailyLoanResult): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error(`Could not load the loan details PDF template (${response.status}).`);

  const pdf = await PDFDocument.load(await response.arrayBuffer());
  const page = pdf.getPages()[0];
  if (!page || pdf.getPageCount() !== 1) throw new Error("The daily loan template must contain one page.");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const text = (content: string, x: number, top: number, width: number, size = 7.4, aligned: "left" | "right" = "left", line = false) => {
    const adjustedTop = line ? top - 3.5 : top;
    const baseline = PAGE_HEIGHT - adjustedTop - size;
    drawText(page, font, content, x, baseline, width, black, size, aligned);
  };
  const amount = (n: number, top: number, x = 480, width = 98) =>
    text(formatAmount(n), x, top, width, 7.4, "right", true);
  const check = (x: number, top: number, checked: boolean) => {
    if (!checked) return;
    const baseline = PAGE_HEIGHT - top - 8;
    page.drawText("X", { x, y: baseline, size: 6.5, font: boldFont, color: black });
  };

  // Loan Details & Financial Summary rows.
  amount(result.principal, 111);
  check(451, 130, result.termMonths === 1);
  check(499, 130, result.termMonths === 2);
  amount(result.interest, 148);
  amount(result.totalDue, 167);
  text(formatDate(result.releaseDate), 459, 186, 140, 7.2);
  text(formatDate(result.maturityDate), 459, 205, 140, 7.2);

  // Amount Computation rows.
  amount(result.principal, 238);
  amount(result.processingFee, 257);
  amount(result.rebateAmount, 276, 485, 93);
  amount(result.prevBalance, 294);
  amount(result.advPayment, 313);
  amount(result.passbookFee, 332);
  amount(result.netProceeds, 350);
  amount(result.dailyPaymentRounded, 376);
  check(451, 394, result.rebateAmount > 0);
  check(482, 394, result.rebateAmount <= 0);

  return pdf.save();
}

function createPdfUrl(bytes: Uint8Array): string {
  const blobBytes = new Uint8Array(bytes.byteLength);
  blobBytes.set(bytes);
  return URL.createObjectURL(new Blob([blobBytes.buffer], { type: "application/pdf" }));
}

export async function downloadDailyLoanDetailsPdf(result: DailyLoanResult): Promise<void> {
  const url = createPdfUrl(await createDailyLoanDetailsPdf(result));
  const link = document.createElement("a");
  link.href = url;
  link.download = `jamo-daily-loan-details-${Math.round(result.principal)}-${result.releaseDate}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function printDailyLoanDetailsPdf(result: DailyLoanResult): Promise<void> {
  const url = createPdfUrl(await createDailyLoanDetailsPdf(result));
  const frame = document.createElement("iframe");
  frame.title = "Daily loan details PDF preview";
  frame.style.position = "fixed";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.border = "0";
  frame.src = url;
  document.body.appendChild(frame);

  const cleanup = () => {
    window.removeEventListener("afterprint", cleanup);
    frame.remove();
    URL.revokeObjectURL(url);
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  frame.addEventListener("load", () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(cleanup, 60_000);
  }, { once: true });
}
