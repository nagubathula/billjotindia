// Domain helpers for People's Tab Management (Khata), Corporate B2B GST Invoices,
// and Outlet Petty Cash / Operational Expenses.

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

// ===========================================================================
// 1. PEOPLE'S TAB MANAGEMENT (KHATA)
// ===========================================================================

export type TabEntryType = "charge" | "payment" | "credit_note";

export const TAB_PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
] as const;

export type TabPaymentMode = (typeof TAB_PAYMENT_MODES)[number]["value"];

export const TAB_PAYMENT_MODE_LABEL: Record<TabPaymentMode, string> =
  Object.fromEntries(
    TAB_PAYMENT_MODES.map((m) => [m.value, m.label]),
  ) as Record<TabPaymentMode, string>;

export function computeTabNextBalance(
  currentBalance: number,
  entryType: TabEntryType,
  amount: number,
): number {
  const cur = Number.isFinite(currentBalance) ? currentBalance : 0;
  const amt = Math.max(0, Number.isFinite(amount) ? amount : 0);
  if (entryType === "charge") {
    return round2(cur + amt);
  }
  return round2(cur - amt);
}

export function checkTabCreditLimit(
  currentBalance: number,
  creditLimit: number,
  chargeAmount: number,
): { withinLimit: boolean; nextBalance: number; overBy: number } {
  const nextBalance = computeTabNextBalance(currentBalance, "charge", chargeAmount);
  const limit = Math.max(0, Number.isFinite(creditLimit) ? creditLimit : 0);
  const overBy = round2(Math.max(0, nextBalance - limit));
  return {
    withinLimit: nextBalance <= limit + 0.001,
    nextBalance,
    overBy,
  };
}

// ===========================================================================
// 2. CORPORATE CLIENTS & B2B GST TAX INVOICES
// ===========================================================================

export const CORPORATE_PAYMENT_TERMS = [
  { value: "due_on_receipt", label: "Due on Receipt", days: 0 },
  { value: "net_7", label: "Net 7 Days", days: 7 },
  { value: "net_15", label: "Net 15 Days", days: 15 },
  { value: "net_30", label: "Net 30 Days", days: 30 },
] as const;

export type CorporatePaymentTerms =
  (typeof CORPORATE_PAYMENT_TERMS)[number]["value"];

export const CORPORATE_PAYMENT_TERMS_LABEL: Record<
  CorporatePaymentTerms,
  string
> = Object.fromEntries(
  CORPORATE_PAYMENT_TERMS.map((t) => [t.value, t.label]),
) as Record<CorporatePaymentTerms, string>;

export const INDIAN_STATES = [
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "29", name: "Karnataka" },
  { code: "27", name: "Maharashtra" },
  { code: "33", name: "Tamil Nadu" },
  { code: "07", name: "Delhi" },
  { code: "06", name: "Haryana" },
  { code: "24", name: "Gujarat" },
  { code: "32", name: "Kerala" },
  { code: "19", name: "West Bengal" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "08", name: "Rajasthan" },
  { code: "34", name: "Puducherry" },
  { code: "30", name: "Goa" },
] as const;

export function inferStateCodeFromGstin(gstin: string | null | undefined): string | null {
  const clean = (gstin ?? "").trim();
  if (/^\d{2}/.test(clean)) return clean.slice(0, 2);
  return null;
}

export function computeDueDate(invoiceDateIso: string, terms: string): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(invoiceDateIso)
    ? new Date(`${invoiceDateIso}T00:00:00Z`)
    : new Date();
  const term = CORPORATE_PAYMENT_TERMS.find((t) => t.value === terms);
  const days = term?.days ?? 15;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export type CorporateInvoiceLineInput = {
  description: string;
  hsn_sac?: string;
  qty: number;
  unit_price: number;
  gst_rate?: number;
};

export type CorporateInvoiceLineComputed = {
  description: string;
  hsn_sac: string;
  qty: number;
  unit_price: number;
  gst_rate: number;
  taxable_value: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

export function computeCorporateInvoiceTotals(
  rawLines: CorporateInvoiceLineInput[],
  supplyType: "intra" | "inter",
): {
  lines: CorporateInvoiceLineComputed[];
  taxableSubtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
} {
  const lines: CorporateInvoiceLineComputed[] = [];
  let taxableSubtotal = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  for (const raw of rawLines) {
    const description = String(raw?.description ?? "").trim();
    const qty = Number(raw?.qty ?? 0);
    const unitPrice = Number(raw?.unit_price ?? 0);
    if (
      !description ||
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      continue;
    }
    const gstRate = Math.max(
      0,
      Math.min(28, Number.isFinite(Number(raw?.gst_rate)) ? Number(raw.gst_rate) : 5),
    );
    const hsnSac = String(raw?.hsn_sac ?? "996331").trim() || "996331";
    const taxableValue = round2(qty * unitPrice);
    const totalGst = round2((taxableValue * gstRate) / 100);
    const cgst = supplyType === "intra" ? round2(totalGst / 2) : 0;
    const sgst = supplyType === "intra" ? round2(totalGst - cgst) : 0;
    const igst = supplyType === "inter" ? totalGst : 0;
    const lineTotal = round2(taxableValue + cgst + sgst + igst);

    taxableSubtotal = round2(taxableSubtotal + taxableValue);
    cgstAmount = round2(cgstAmount + cgst);
    sgstAmount = round2(sgstAmount + sgst);
    igstAmount = round2(igstAmount + igst);

    lines.push({
      description: description.slice(0, 180),
      hsn_sac: hsnSac.slice(0, 16),
      qty: round2(qty),
      unit_price: round2(unitPrice),
      gst_rate: gstRate,
      taxable_value: taxableValue,
      cgst,
      sgst,
      igst,
      total: lineTotal,
    });
  }

  const totalAmount = round2(taxableSubtotal + cgstAmount + sgstAmount + igstAmount);
  return {
    lines,
    taxableSubtotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalAmount,
  };
}

export function computeInvoicePaymentStatus(
  totalAmount: number,
  amountPaid: number,
): "unpaid" | "partial" | "paid" {
  const total = round2(totalAmount);
  const paid = round2(amountPaid);
  if (total > 0 && paid >= total - 0.01) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigitsWords(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? ` ${ONES[o]}` : ""}`;
}

function intToIndianWords(num: number): string {
  if (num === 0) return "Zero";
  let n = Math.floor(num);
  const parts: string[] = [];

  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  if (crore > 0) parts.push(`${intToIndianWords(crore)} Crore`);

  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  if (lakh > 0) parts.push(`${twoDigitsWords(lakh)} Lakh`);

  const thousand = Math.floor(n / 1_000);
  n %= 1_000;
  if (thousand > 0) parts.push(`${twoDigitsWords(thousand)} Thousand`);

  const hundred = Math.floor(n / 100);
  n %= 100;
  if (hundred > 0) parts.push(`${ONES[hundred]} Hundred`);

  if (n > 0) parts.push(twoDigitsWords(n));

  return parts.join(" ").trim();
}

export function amountInWordsInr(amount: number): string {
  const safe = round2(Math.max(0, Number.isFinite(amount) ? amount : 0));
  const rupees = Math.floor(safe);
  const paise = Math.round((safe - rupees) * 100);
  const rupeePart = `Rupees ${intToIndianWords(rupees)}`;
  if (paise > 0) {
    return `${rupeePart} and ${twoDigitsWords(paise)} Paise Only`;
  }
  return `${rupeePart} Only`;
}

// ===========================================================================
// 3. PETTY CASH & OUTLET EXPENSES
// ===========================================================================

export const EXPENSE_CATEGORIES = [
  { value: "supplies", label: "Kitchen & Market Supplies" },
  { value: "gas_fuel", label: "LPG Gas & Fuel" },
  { value: "utilities", label: "Electricity, Water & Internet" },
  { value: "repairs", label: "Repairs & Maintenance" },
  { value: "cleaning", label: "Cleaning & Housekeeping" },
  { value: "staff_welfare", label: "Staff Meals & Welfare" },
  { value: "logistics", label: "Porter, Delivery & Transport" },
  { value: "marketing", label: "Local Promotions & Print" },
  { value: "misc", label: "Miscellaneous" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> =
  Object.fromEntries(
    EXPENSE_CATEGORIES.map((c) => [c.value, c.label]),
  ) as Record<ExpenseCategory, string>;
