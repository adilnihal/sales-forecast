const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** ₹1,23,456.50 (Indian digit grouping) */
export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return `${n < 0 ? "−" : ""}₹${inr2.format(Math.abs(n))}`;
}

/** ₹1,23,457 without paise, for big summary figures */
export function inrWhole(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return `${n < 0 ? "−" : ""}₹${inr0.format(Math.abs(n))}`;
}

export function qty(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return num.format(n);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 2026-10-05 -> 05 Oct 2026 */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

/** 2026-10 -> Oct 2026 */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** 2026-10 -> Oct */
export function monthShort(ym: string): string {
  return MONTHS[Number(ym.split("-")[1]) - 1];
}

/** Today in the browser's own time zone as YYYY-MM-DD (not UTC, so late-night bills keep their date). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Same rounding as the server so the form total always matches the saved bill. */
export function lineAmounts(qtyVal: number, rate: number, gstPercent: number) {
  const taxable = round2(qtyVal * rate);
  const gst = round2((taxable * gstPercent) / 100);
  return { taxable, gst, total: round2(taxable + gst) };
}
