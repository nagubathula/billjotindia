import type { OrderPaymentMode } from "@/lib/types";

export const DENOMINATIONS = [500, 200, 100, 50, 20, 10] as const;

export type SplitAllocationInput = {
  mode: "cash" | "upi" | "card";
  amount: number;
  referenceNo?: string | null;
};

export type OrderSummaryInput = {
  id: string;
  source: string;
  status: string | null;
  customer_name: string;
  customer_email: string | null;
  payment_mode?: string | null;
  external_status?: string | null;
  token_number?: number | null;
  placed_at?: string | null;
  total_amount: number | string | null;
  cgst_amount?: number | string | null;
  sgst_amount?: number | string | null;
  discount_amount?: number | string | null;
  net_payout?: number | string | null;
};

export type OrderPaymentLeg = {
  order_id: string;
  payment_mode: string;
  amount: number | string;
};

export type OpenTableSummaryRow = {
  id: string;
  label: string;
  tokenNumber: number | null;
  amount: number;
  placedAt: string | null;
};

export type RegisterOrdersSummary = {
  totalOrders: number;
  cancelledOrders: number;
  openTablesCount: number;
  openTablesAmount: number;
  openTables: OpenTableSummaryRow[];
  grossSales: number;
  cgst: number;
  sgst: number;
  discounts: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  tabSales: number;
  webSales: number;
  aggregatorGross: number;
  aggregatorNet: number;
};

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

const VALID_PAYMENT_MODES = new Set<OrderPaymentMode>([
  "open",
  "cash",
  "upi",
  "card",
  "razorpay",
  "stripe",
  "tab",
  "online",
  "split",
  "aggregator",
]);

export function resolveOrderPaymentMode(
  order: {
    source: string;
    payment_mode?: string | null;
    customer_email?: string | null;
    external_status?: string | null;
  },
  fallbackItemTender?: string | null,
): OrderPaymentMode {
  const explicit = order.payment_mode?.trim().toLowerCase();
  if (explicit && VALID_PAYMENT_MODES.has(explicit as OrderPaymentMode)) {
    return explicit as OrderPaymentMode;
  }

  if (order.source === "pos") {
    const email = (order.customer_email ?? "").toLowerCase();
    if (email.startsWith("pos+open")) return "open";
    if (email.startsWith("pos+tab")) return "tab";
    if (email.startsWith("pos+split")) return "split";
    if (email.startsWith("pos+upi")) return "upi";
    if (email.startsWith("pos+razorpay")) return "razorpay";
    if (email.startsWith("pos+card")) return "card";
    if (email.startsWith("pos+stripe")) return "stripe";
    const fb = fallbackItemTender?.trim().toLowerCase();
    if (fb && VALID_PAYMENT_MODES.has(fb as OrderPaymentMode)) {
      return fb as OrderPaymentMode;
    }
    if (email.startsWith("pos+")) {
      const parsed = email.split("@")[0].replace("pos+", "");
      if (VALID_PAYMENT_MODES.has(parsed as OrderPaymentMode)) {
        return parsed as OrderPaymentMode;
      }
    }
    return "cash";
  }

  if (order.source === "web" || order.source === "kiosk") {
    return "online";
  }

  return "aggregator";
}

export function formatOrderTenderLabel(
  order: {
    source: string;
    payment_mode?: string | null;
    customer_email?: string | null;
    external_payload?: unknown;
    external_status?: string | null;
  },
  payments?: Array<{ payment_mode: string; amount: number | string }>,
): string | null {
  if (payments && payments.length > 1) {
    return payments
      .map(
        (p) =>
          `${String(p.payment_mode).toUpperCase()} ₹${Math.round(Number(p.amount) || 0)}`,
      )
      .join(" + ");
  }
  if (payments && payments.length === 1) {
    return String(payments[0].payment_mode).toUpperCase();
  }

  const ext =
    order.external_payload &&
    typeof order.external_payload === "object" &&
    !Array.isArray(order.external_payload)
      ? (order.external_payload as { gateway?: string; payment_id?: string })
      : null;

  if (ext?.gateway) {
    return `${ext.gateway.toUpperCase()}${ext.payment_id ? ` (${ext.payment_id.slice(-10)})` : ""}`;
  }

  const mode = resolveOrderPaymentMode(order);
  if (mode === "open") return "OPEN TABLE";
  if (mode === "tab") return "CUSTOMER TAB (KHATA)";
  if (mode === "split") return "SPLIT PAYMENT";
  if (mode === "online") {
    return order.external_status === "paid" ? "ONLINE PAID" : "PAY AT COUNTER";
  }
  if (mode === "aggregator") return String(order.source).toUpperCase();
  return mode.toUpperCase();
}

export function summarizeRegisterOrders(
  orders: OrderSummaryInput[],
  paymentsByOrderId: Map<string, OrderPaymentLeg[]> = new Map(),
): RegisterOrdersSummary {
  const valid = orders.filter((ord) => ord.status !== "cancelled");
  const cancelledCount = orders.filter((ord) => ord.status === "cancelled").length;

  let settledCount = 0;
  let grossSales = 0;
  let cgst = 0;
  let sgst = 0;
  let discounts = 0;
  let cashSales = 0;
  let upiSales = 0;
  let cardSales = 0;
  let tabSales = 0;
  let webSales = 0;
  let aggregatorGross = 0;
  let aggregatorNet = 0;
  let openTablesAmount = 0;
  const openTables: OpenTableSummaryRow[] = [];

  for (const ord of valid) {
    const amt = Number(ord.total_amount ?? 0);
    const mode = resolveOrderPaymentMode(ord);

    if (mode === "open") {
      openTablesAmount = round2(openTablesAmount + amt);
      openTables.push({
        id: ord.id,
        label: ord.customer_name || "Open Table",
        tokenNumber: ord.token_number ?? null,
        amount: amt,
        placedAt: ord.placed_at ?? null,
      });
      continue;
    }

    settledCount += 1;
    grossSales = round2(grossSales + amt);
    cgst = round2(cgst + Number(ord.cgst_amount ?? 0));
    sgst = round2(sgst + Number(ord.sgst_amount ?? 0));
    discounts = round2(discounts + Number(ord.discount_amount ?? 0));

    if (ord.source !== "pos" && ord.source !== "web" && ord.source !== "kiosk") {
      aggregatorGross = round2(aggregatorGross + amt);
      aggregatorNet = round2(aggregatorNet + Number(ord.net_payout ?? amt * 0.78));
      continue;
    }

    const legs = paymentsByOrderId.get(ord.id) ?? [];
    if (legs.length > 0) {
      for (const leg of legs) {
        const legAmt = Number(leg.amount ?? 0);
        if (leg.payment_mode === "cash") cashSales = round2(cashSales + legAmt);
        else if (leg.payment_mode === "upi" || leg.payment_mode === "razorpay") {
          upiSales = round2(upiSales + legAmt);
        } else if (leg.payment_mode === "card" || leg.payment_mode === "stripe") {
          cardSales = round2(cardSales + legAmt);
        } else if (leg.payment_mode === "tab") {
          tabSales = round2(tabSales + legAmt);
        } else {
          webSales = round2(webSales + legAmt);
        }
      }
      continue;
    }

    if (ord.source === "web" || ord.source === "kiosk") {
      webSales = round2(webSales + amt);
    } else if (mode === "tab") {
      tabSales = round2(tabSales + amt);
    } else if (mode === "upi" || mode === "razorpay") {
      upiSales = round2(upiSales + amt);
    } else if (mode === "card" || mode === "stripe") {
      cardSales = round2(cardSales + amt);
    } else if (mode === "online") {
      webSales = round2(webSales + amt);
    } else {
      cashSales = round2(cashSales + amt);
    }
  }

  return {
    totalOrders: settledCount,
    cancelledOrders: cancelledCount,
    openTablesCount: openTables.length,
    openTablesAmount,
    openTables,
    grossSales,
    cgst,
    sgst,
    discounts,
    cashSales,
    upiSales,
    cardSales,
    tabSales,
    webSales,
    aggregatorGross,
    aggregatorNet,
  };
}

export function computeDrawerReconciliation(params: {
  openingFloat: number;
  cashSales: number;
  cashPettyExpenses: number;
  denominations: Record<string, number>;
}): { expectedCash: number; countedCash: number; variance: number } {
  const floatAmt = Math.max(0, Number(params.openingFloat) || 0);
  const sales = Math.max(0, Number(params.cashSales) || 0);
  const petty = Math.max(0, Number(params.cashPettyExpenses) || 0);
  const expectedCash = Math.max(0, Math.round(floatAmt + sales - petty));

  let counted = 0;
  for (const d of DENOMINATIONS) {
    const count = Math.max(
      0,
      Math.floor(Number(params.denominations[String(d)] ?? 0) || 0),
    );
    counted += d * count;
  }

  return {
    expectedCash,
    countedCash: counted,
    variance: counted - expectedCash,
  };
}

export function validateSplitAllocations(
  totalAmount: number,
  allocations: SplitAllocationInput[],
):
  | {
      ok: true;
      normalized: Array<{
        mode: "cash" | "upi" | "card";
        amount: number;
        referenceNo: string | null;
      }>;
    }
  | { ok: false; error: string } {
  const target = round2(Math.max(0, Number(totalAmount) || 0));
  if (target <= 0) {
    return { ok: false, error: "Nothing due on this bill." };
  }

  const normalized: Array<{
    mode: "cash" | "upi" | "card";
    amount: number;
    referenceNo: string | null;
  }> = [];

  for (const row of allocations ?? []) {
    if (row.mode !== "cash" && row.mode !== "upi" && row.mode !== "card") {
      return { ok: false, error: "Split tenders must be cash, upi, or card." };
    }
    const amt = round2(Number(row.amount) || 0);
    if (amt <= 0) continue;
    normalized.push({
      mode: row.mode,
      amount: amt,
      referenceNo: row.referenceNo?.trim().slice(0, 80) || null,
    });
  }

  if (normalized.length === 0) {
    return { ok: false, error: "Enter at least one positive payment amount." };
  }

  const sum = round2(normalized.reduce((s, r) => s + r.amount, 0));
  if (Math.abs(sum - target) > 0.05) {
    return {
      ok: false,
      error: `Split legs add up to ₹${sum.toFixed(2)}, expected ₹${target.toFixed(2)}.`,
    };
  }

  return { ok: true, normalized };
}
