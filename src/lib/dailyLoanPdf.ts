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

function amountInWords(value: number): string {
  const whole = Math.floor(value);
  const cents = Math.round((value - whole) * 100);
  return `${numberToWords(whole)} and ${String(cents).padStart(2, "0")}/100`;
}

function numberToWords(value: number): string {
  const ones = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if (value === 0) return "Zero";

  const underThousand = (n: number): string => {
    const words: string[] = [];
    if (n >= 100) {
      words.push(ones[Math.floor(n / 100)], "Hundred");
      n %= 100;
    }
    if (n >= 20) {
      words.push(tens[Math.floor(n / 10)]);
      if (n % 10) words.push(ones[n % 10]);
    } else if (n >= 10) {
      words.push(teens[n - 10]);
    } else if (n > 0) {
      words.push(ones[n]);
    }
    return words.join(" ");
  };

  const chunks: string[] = [];
  const units = ["", "Thousand", "Million", "Billion"];
  let unitIndex = 0;
  while (value > 0) {
    const chunk = value % 1000;
    if (chunk) chunks.unshift(`${underThousand(chunk)}${units[unitIndex] ? ` ${units[unitIndex]}` : ""}`);
    value = Math.floor(value / 1000);
    unitIndex += 1;
  }
  return chunks.join(" ");
}

function drawValue(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  top: number,
  width: number,
  black: RGB,
  size = 7.5,
  align: "left" | "right" = "left",
): void {
  text = text.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\x20-\x7E]/g, "");
  if (!text) return;
  const fontSize = Math.max(6.2, Math.min(size, (width / font.widthOfTextAtSize(text, 1))));
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textX = align === "right" ? x + width - textWidth : x;
  const textY = PAGE_HEIGHT - top - fontSize;

  page.drawText(text, { x: textX, y: textY, size: fontSize, font, color: black });
}

function drawCheck(
  page: PDFPage,
  font: PDFFont,
  x: number,
  top: number,
  checked: boolean,
  black: RGB,
): void {
  if (!checked) return;
  page.drawText("X", { x, y: PAGE_HEIGHT - top - 8, size: 6.5, font, color: black });
}

export async function createFilledDailyLoanPdf(result: DailyLoanResult): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const black = rgb(0, 0, 0);
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error(`Could not load the daily loan PDF template (${response.status}).`);

  const pdf = await PDFDocument.load(await response.arrayBuffer());
  const page = pdf.getPages()[0];
  if (!page || pdf.getPageCount() !== 1) throw new Error("The daily loan template must contain one page.");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const value = (text: string, x: number, top: number, width: number, size = 7.5, align: "left" | "right" = "left") =>
    drawValue(page, font, text, x, top, width, black, size, align);
  const lineValue = (text: string, x: number, top: number, width: number, size = 7.5, align: "left" | "right" = "left") =>
    value(text, x, top - 3.5, width, size, align);
  // Keep amounts within the PDF's right-side table edge and align them to its printed rules.
  const money = (n: number, top: number, x = 480, width = 98) =>
    lineValue(formatAmount(n), x, top, width, 7.4, "right");

  // Borrower and loan summary at the top of the source form.
  value(result.fullName.trim(), 135, 111, 160, 8.5);
  money(result.principal, 111);
  drawCheck(page, boldFont, 451, 130, result.termMonths === 1, black);
  drawCheck(page, boldFont, 499, 130, result.termMonths === 2, black);
  money(result.interest, 148);
  money(result.totalDue, 167);
  value(formatDate(result.releaseDate), 459, 186, 140, 7.2);
  value(formatDate(result.maturityDate), 459, 205, 140, 7.2);

  // Amount computation.
  money(result.principal, 238);
  money(result.processingFee, 257);
  money(result.rebateAmount, 276, 485, 93);
  money(result.prevBalance, 294);
  money(result.advPayment, 313);
  money(result.passbookFee, 332);
  money(result.netProceeds, 350);
  money(result.dailyPaymentRounded, 376);
  drawCheck(page, boldFont, 451, 394, result.rebateAmount > 0, black);
  drawCheck(page, boldFont, 482, 394, result.rebateAmount <= 0, black);

  // Truth-in-lending table.
  lineValue(formatAmount(result.principal), 194, 708, 102, 7.4, "right");
  lineValue(String(result.termMonths), 194, 721, 30, 7.4);
  lineValue(formatAmount(result.interest), 194, 759, 102, 7.4, "right");
  lineValue(formatAmount(result.processingFee), 194, 773, 102, 7.4, "right");
  lineValue(formatAmount(result.rebateAmount), 200, 786, 96, 7.4, "right");
  lineValue(formatAmount(result.netProceeds), 194, 800, 102, 7.4, "right");
  lineValue(formatAmount(result.totalDue), 194, 813, 102, 7.4, "right");

  // Promissory note values and approval amount.
  lineValue(result.fullName.trim(), 310, 458, 166, 7.4);
  lineValue(formatAmount(result.netProceeds), 310, 490, 244, 7.4);
  lineValue(amountInWords(result.netProceeds), 310, 500, 280, 7.0);
  lineValue(formatAmount(result.processingFee), 439, 534, 51, 7.0, "right");
  lineValue(formatAmount(result.rebateAmount), 398, 556, 54, 7.0, "right");
  lineValue(formatAmount(result.dailyPaymentRounded), 418, 588, 50, 7.0, "right");
  lineValue(formatDate(result.maturityDate), 386, 610, 63, 7.0);
  lineValue(formatAmount(result.dailyPaymentRounded), 548, 847, 31, 6.8, "right");

  return pdf.save();
}

function createPdfUrl(bytes: Uint8Array): string {
  const blobBytes = new Uint8Array(bytes.byteLength);
  blobBytes.set(bytes);
  return URL.createObjectURL(new Blob([blobBytes.buffer], { type: "application/pdf" }));
}

export async function downloadFilledDailyLoanPdf(result: DailyLoanResult): Promise<void> {
  const bytes = await createFilledDailyLoanPdf(result);
  const url = createPdfUrl(bytes);
  const link = document.createElement("a");
  link.href = url;
  link.download = `jamo-daily-loan-${Math.round(result.principal)}-${result.releaseDate}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function printFilledDailyLoanPdf(result: DailyLoanResult): Promise<void> {
  const bytes = await createFilledDailyLoanPdf(result);
  const url = createPdfUrl(bytes);
  const frame = document.createElement("iframe");
  frame.title = "Daily loan PDF preview";
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
