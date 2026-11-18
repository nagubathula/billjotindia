// Vendor Management domain types, GSTIN validation, and PO calculation helpers.

export const VENDOR_CATEGORIES = [
  { value: "produce", label: "Fresh Produce" },
  { value: "meat_seafood", label: "Meat & Seafood" },
  { value: "dairy_oils", label: "Dairy & Oils" },
  { value: "grocery", label: "Grains & Grocery" },
  { value: "spices", label: "Spices & Dry Goods" },
  { value: "packaging", label: "Packaging & Disposables" },
  { value: "beverages", label: "Beverages" },
  { value: "utilities_maintenance", label: "Utilities & Maintenance" },
  { value: "other", label: "Other" },
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number]["value"];

export const VENDOR_CATEGORY_LABEL: Record<VendorCategory, string> =
  Object.fromEntries(
    VENDOR_CATEGORIES.map((c) => [c.value, c.label]),
  ) as Record<VendorCategory, string>;

export const VENDOR_PAYMENT_TERMS = [
  { value: "cod", label: "Cash on Delivery" },
  { value: "net_7", label: "Net 7 Days" },
  { value: "net_15", label: "Net 15 Days" },
  { value: "net_30", label: "Net 30 Days" },
] as const;

export type VendorPaymentTerms = (typeof VENDOR_PAYMENT_TERMS)[number]["value"];

export const VENDOR_PAYMENT_TERMS_LABEL: Record<VendorPaymentTerms, string> =
  Object.fromEntries(
    VENDOR_PAYMENT_TERMS.map((t) => [t.value, t.label]),
  ) as Record<VendorPaymentTerms, string>;

export const PO_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "ordered", label: "Ordered" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export type PoStatus = (typeof PO_STATUSES)[number]["value"];

export const VENDOR_PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
] as const;

export type VendorPaymentMode = (typeof VENDOR_PAYMENT_MODES)[number]["value"];

export const VENDOR_PAYMENT_MODE_LABEL: Record<VendorPaymentMode, string> =
  Object.fromEntries(
    VENDOR_PAYMENT_MODES.map((m) => [m.value, m.label]),
  ) as Record<VendorPaymentMode, string>;

export type PurchaseOrderItemInput = {
  name: string;
  unit: string;
  qty: number;
  unit_cost: number;
  gst_rate?: number;
};

export type NormalizedPurchaseOrderItem = {
  name: string;
  unit: string;
  qty: number;
  unit_cost: number;
  gst_rate: number;
  line_subtotal: number;
  line_gst: number;
  line_total: number;
};

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z0-9]{1}$/i;

/** Blank GSTIN is valid (optional field); non-blank must match 15-char Indian GSTIN format. */
export function isValidGstin(raw: string | null | undefined): boolean {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return true;
  return GSTIN_RE.test(trimmed);
}

export function computePurchaseOrderTotals(rawItems: PurchaseOrderItemInput[]): {
  items: NormalizedPurchaseOrderItem[];
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
} {
  const items: NormalizedPurchaseOrderItem[] = [];
  let subtotal = 0;
  let gstAmount = 0;

  for (const raw of rawItems) {
    const name = String(raw?.name ?? "").trim();
    const unit = String(raw?.unit ?? "kg").trim() || "pcs";
    const qty = Number(raw?.qty ?? 0);
    const unitCost = Number(raw?.unit_cost ?? 0);
    if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      continue;
    }
    const gstRate = Math.max(
      0,
      Math.min(28, Number.isFinite(Number(raw?.gst_rate)) ? Number(raw.gst_rate) : 0),
    );
    const lineSubtotal = round2(qty * unitCost);
    const lineGst = round2((lineSubtotal * gstRate) / 100);
    const lineTotal = round2(lineSubtotal + lineGst);

    subtotal = round2(subtotal + lineSubtotal);
    gstAmount = round2(gstAmount + lineGst);
    items.push({
      name: name.slice(0, 120),
      unit: unit.slice(0, 24),
      qty: round2(qty),
      unit_cost: round2(unitCost),
      gst_rate: gstRate,
      line_subtotal: lineSubtotal,
      line_gst: lineGst,
      line_total: lineTotal,
    });
  }

  const totalAmount = round2(subtotal + gstAmount);
  return { items, subtotal, gstAmount, totalAmount };
}

export function derivePoPaymentStatus(
  totalAmount: number,
  amountPaid: number,
): "unpaid" | "partial" | "paid" {
  const total = Math.max(0, Number(totalAmount) || 0);
  const paid = Math.max(0, Number(amountPaid) || 0);
  if (paid <= 0.009) return "unpaid";
  if (paid + 0.01 >= total) return "paid";
  return "partial";
}
