import { INDIAN_STATES, inferStateCodeFromGstin } from "./accounts";
import { resolveOrderPaymentMode } from "./register";
import { dayKey, resolveTimeZone } from "./time";
import type {
  CorporateClient,
  CorporateInvoice,
  Order,
  OrderItem,
  OrderPayment,
  ProductConfig,
} from "./types";

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export type Gstr1B2bRow = {
  recipientGstin: string;
  receiverName: string;
  invoiceNumber: string;
  invoiceDate: string; // dd-MMM-yyyy or yyyy-mm-dd
  invoiceValue: number;
  placeOfSupply: string;
  supplyType: "intra_state" | "inter_state";
  rate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
};

export type Gstr1B2csRow = {
  placeOfSupply: string;
  rate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  grossTotal: number;
  orderCount: number;
};

export type Gstr1HsnRow = {
  hsn: string;
  description: string;
  uqc: "OTH" | "NOS";
  totalQty: number;
  rate: number;
  totalValue: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
};

export type Gstr1DocSeriesRow = {
  nature: string;
  srNoFrom: string;
  srNoTo: string;
  totalNumber: number;
  cancelled: number;
  netIssued: number;
};

export type TallyDailyVoucher = {
  voucherKey: string;
  dateYyyymmdd: string; // YYYYMMDD for Tally XML
  dateDisplay: string;
  voucherType: "Sales";
  voucherNumber: string;
  partyLedger: string;
  narration: string;
  grossTotal: number;
  taxableSales: number;
  cgst: number;
  sgst: number;
  igst: number;
  packingCharges: number;
  roundOffCredit: number; // residual credit/debit so voucher balances to exact 0.00
};

export type CaAccountingReport = {
  restaurantName: string;
  outletGstin: string | null;
  placeOfSupply: string;
  periodLabel: string;
  b2bRows: Gstr1B2bRow[];
  b2csRows: Gstr1B2csRow[];
  hsnRows: Gstr1HsnRow[];
  docSummary: Gstr1DocSeriesRow[];
  tallyVouchers: TallyDailyVoucher[];
  ecoSec95: {
    orderCount: number;
    grossAmount: number;
    cgstNote: string;
  };
  totals: {
    b2bTaxable: number;
    b2bTax: number;
    b2bInvoiceValue: number;
    b2csTaxable: number;
    b2csTax: number;
    b2csGross: number;
    hsnTaxable: number;
    hsnTotalValue: number;
  };
};

function placeOfSupplyLabel(gstin: string | null): string {
  const code = inferStateCodeFromGstin(gstin) ?? "36";
  const st = INDIAN_STATES.find((s) => s.code === code);
  return st ? `${st.code}-${st.name}` : `${code}-State`;
}

function itemConfigOf(it: OrderItem): ProductConfig & {
  gst_rate?: number;
  hsn_code?: string | null;
} {
  if (it.product_config && typeof it.product_config === "object" && !Array.isArray(it.product_config)) {
    return it.product_config as unknown as ProductConfig & {
      gst_rate?: number;
      hsn_code?: string | null;
    };
  }
  return { product_id: "", name: "Item", base_price: 0 };
}

function tallyLedgerForPaymentMode(mode: string): string {
  switch (mode) {
    case "cash":
      return "Cash-in-Hand";
    case "upi":
      return "UPI / QR Bank Settlement";
    case "card":
      return "Card EDC Bank Settlement";
    case "razorpay":
      return "Razorpay Gateway Settlement";
    case "stripe":
      return "Stripe Gateway Settlement";
    case "tab":
      return "Customer Khata Receivables";
    case "aggregator":
      return "Delivery Aggregator Receivables";
    default:
      return "Online & Counter Receivables";
  }
}

export function buildCaAccountingReport(input: {
  restaurantName: string;
  outletGstin: string | null;
  timeZone?: string | null;
  periodLabel: string;
  orders: Order[];
  orderItems: OrderItem[];
  cancelledOrdersCount: number;
  corporateInvoices: CorporateInvoice[];
  corporateClients: CorporateClient[];
  paymentsByOrderId?: Map<string, OrderPayment[]>;
}): CaAccountingReport {
  const tz = resolveTimeZone(input.timeZone);
  const posPlace = placeOfSupplyLabel(input.outletGstin);
  const clientById = new Map(input.corporateClients.map((c) => [c.id, c]));

  // Orders already converted into formal Corporate B2B Tax Invoices are reported
  // in Table 4A (B2B) and excluded from Table 7 (B2CS) to prevent double-counting.
  const b2bLinkedOrderIds = new Set<string>();
  const b2bRows: Gstr1B2bRow[] = [];
  const corporateVouchers: TallyDailyVoucher[] = [];

  for (const inv of input.corporateInvoices) {
    if (inv.status === "cancelled") continue;
    for (const oid of inv.linked_order_ids ?? []) {
      b2bLinkedOrderIds.add(oid);
    }
    const client = clientById.get(inv.corporate_client_id);
    const total = round2(Number(inv.total_amount || 0));
    const taxable = round2(Number(inv.taxable_subtotal || 0));
    const cgst = round2(Number(inv.cgst_amount || 0));
    const sgst = round2(Number(inv.sgst_amount || 0));
    const igst = round2(Number(inv.igst_amount || 0));
    const taxTotal = cgst + sgst + igst;
    const effRate = taxable > 0 ? Math.round((taxTotal / taxable) * 100) : 5;
    const invPos = inv.place_of_supply?.trim()
      ? inv.place_of_supply.trim()
      : client?.state_code && client?.state_name
        ? `${client.state_code}-${client.state_name}`
        : posPlace;

    b2bRows.push({
      recipientGstin: client?.gstin?.trim() || "URP",
      receiverName: client?.company_name ?? "Corporate Client",
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date,
      invoiceValue: total,
      placeOfSupply: invPos,
      supplyType: inv.supply_type === "inter_state" ? "inter_state" : "intra_state",
      rate: effRate,
      taxableValue: taxable,
      cgst,
      sgst,
      igst,
    });

    const dateStr = (inv.invoice_date || "").replace(/-/g, "").slice(0, 8) || "20260101";
    const residual = round2(total - (taxable + cgst + sgst + igst));
    corporateVouchers.push({
      voucherKey: `B2B-${inv.id}`,
      dateYyyymmdd: dateStr,
      dateDisplay: inv.invoice_date,
      voucherType: "Sales",
      voucherNumber: inv.invoice_number,
      partyLedger: client?.company_name ?? "Corporate Debtors",
      narration: `B2B Tax Invoice ${inv.invoice_number} (GSTIN: ${client?.gstin ?? "N/A"})`,
      grossTotal: total,
      taxableSales: taxable,
      cgst,
      sgst,
      igst,
      packingCharges: 0,
      roundOffCredit: residual,
    });
  }

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const it of input.orderItems) {
    if (!it.order_id) continue;
    const arr = itemsByOrder.get(it.order_id) ?? [];
    arr.push(it);
    itemsByOrder.set(it.order_id, arr);
  }

  // Group Table 7 (B2CS), Table 12 (HSN), and Table 14 (ECO Sec 9(5))
  const b2csMap = new Map<number, Gstr1B2csRow>();
  const hsnMap = new Map<string, Gstr1HsnRow>();
  let ecoCount = 0;
  let ecoGross = 0;

  // Daily Tally Sales vouchers grouped by (dateKey, ledgerName)
  const tallyDailyMap = new Map<
    string,
    {
      dateKey: string;
      ledger: string;
      grossTotal: number;
      taxableSales: number;
      cgst: number;
      sgst: number;
      packingCharges: number;
      billCount: number;
    }
  >();

  const posOrdersForSeries: string[] = [];

  for (const o of input.orders) {
    if (o.status === "cancelled") continue;
    const mode = resolveOrderPaymentMode(o);
    if (mode === "open") continue;

    if (o.unique_order_id) posOrdersForSeries.push(o.unique_order_id);

    if (o.gst_paid_by_operator) {
      ecoCount += 1;
      ecoGross = round2(ecoGross + Number(o.total_amount || 0));
      continue;
    }

    const oItems = itemsByOrder.get(o.id) ?? [];
    const rawItemsSum = oItems.reduce((s, it) => s + Number(it.total_price || 0), 0);
    const totalDiscount =
      Math.max(0, Number(o.discount_amount || 0)) +
      Math.max(0, Number(o.loyalty_discount_amount || 0));
    const discountFactor =
      rawItemsSum > 0 ? Math.max(0, 1 - Math.min(rawItemsSum, totalDiscount) / rawItemsSum) : 1;

    const isB2bBilled = b2bLinkedOrderIds.has(o.id);
    let orderTaxableTotal = 0;
    let orderCgstTotal = 0;
    let orderSgstTotal = 0;

    for (const it of oItems) {
      const cfg = itemConfigOf(it);
      const rate = Number.isFinite(Number(cfg.gst_rate)) ? Number(cfg.gst_rate) : 5;
      const hsn = (cfg.hsn_code ?? "996331").trim() || "996331";
      const lineGrossAfterDisc = Number(it.total_price || 0) * discountFactor;
      const lineTaxable = lineGrossAfterDisc / (1 + rate / 100);
      const lineTax = lineGrossAfterDisc - lineTaxable;
      const halfTax = lineTax / 2;

      orderTaxableTotal += lineTaxable;
      orderCgstTotal += halfTax;
      orderSgstTotal += halfTax;

      if (!isB2bBilled) {
        const bRow = b2csMap.get(rate) ?? {
          placeOfSupply: posPlace,
          rate,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          grossTotal: 0,
          orderCount: 0,
        };
        bRow.taxableValue += lineTaxable;
        bRow.cgst += halfTax;
        bRow.sgst += halfTax;
        bRow.grossTotal += lineGrossAfterDisc;
        b2csMap.set(rate, bRow);
      }

      // HSN summary includes all direct restaurant supplies
      const hsnKey = `${hsn}::${rate}`;
      const uqc: "OTH" | "NOS" = hsn.startsWith("99") ? "OTH" : "NOS";
      const hRow = hsnMap.get(hsnKey) ?? {
        hsn,
        description:
          hsn === "996331"
            ? "Restaurant & Catering Food Services"
            : cfg.name || `HSN ${hsn}`,
        uqc,
        totalQty: 0,
        rate,
        totalValue: 0,
        taxableValue: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
      };
      hRow.totalQty += Number(it.quantity || 0);
      hRow.totalValue += lineGrossAfterDisc;
      hRow.taxableValue += lineTaxable;
      hRow.cgst += halfTax;
      hRow.sgst += halfTax;
      hsnMap.set(hsnKey, hRow);
    }

    const packing = Math.max(0, Number(o.takeaway_charges || 0));
    if (packing > 0) {
      const hRow = hsnMap.get("996331::5") ?? {
        hsn: "996331",
        description: "Restaurant & Catering Food Services",
        uqc: "OTH",
        totalQty: 0,
        rate: 5,
        totalValue: 0,
        taxableValue: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
      };
      hRow.totalValue += packing;
      hRow.taxableValue += packing;
      hsnMap.set("996331::5", hRow);
    }

    // Track per-slab order count on non-B2B orders
    if (!isB2bBilled) {
      const seenRates = new Set(
        oItems.map((it) => {
          const cfg = itemConfigOf(it);
          return Number.isFinite(Number(cfg.gst_rate)) ? Number(cfg.gst_rate) : 5;
        }),
      );
      for (const r of seenRates) {
        const bRow = b2csMap.get(r);
        if (bRow) bRow.orderCount += 1;
      }
    }

    // Build Tally daily buckets (proportional across split payment legs if present)
    if (!isB2bBilled) {
      const dKey = dayKey(new Date(o.placed_at), tz);
      const legs = input.paymentsByOrderId?.get(o.id) ?? [];
      const orderTotal = Math.max(0, Number(o.total_amount || 0));
      const allocations: Array<{ mode: string; amount: number }> =
        legs.length > 0
          ? legs.map((l) => ({ mode: l.payment_mode, amount: Number(l.amount || 0) }))
          : [{ mode, amount: orderTotal }];

      for (const leg of allocations) {
        if (leg.amount <= 0) continue;
        const share = orderTotal > 0 ? leg.amount / orderTotal : 1;
        const ledger = tallyLedgerForPaymentMode(leg.mode);
        const key = `${dKey}::${ledger}`;
        const cur = tallyDailyMap.get(key) ?? {
          dateKey: dKey,
          ledger,
          grossTotal: 0,
          taxableSales: 0,
          cgst: 0,
          sgst: 0,
          packingCharges: 0,
          billCount: 0,
        };
        cur.grossTotal += leg.amount;
        cur.taxableSales += orderTaxableTotal * share;
        cur.cgst += orderCgstTotal * share;
        cur.sgst += orderSgstTotal * share;
        cur.packingCharges += packing * share;
        cur.billCount += 1;
        tallyDailyMap.set(key, cur);
      }
    }
  }

  const b2csRows: Gstr1B2csRow[] = Array.from(b2csMap.values())
    .map((r) => ({
      ...r,
      taxableValue: round2(r.taxableValue),
      cgst: round2(r.cgst),
      sgst: round2(r.sgst),
      igst: round2(r.igst),
      grossTotal: round2(r.grossTotal),
    }))
    .sort((a, b) => a.rate - b.rate);

  const hsnRows: Gstr1HsnRow[] = Array.from(hsnMap.values())
    .map((h) => ({
      ...h,
      totalQty: Math.round(h.totalQty * 100) / 100,
      totalValue: round2(h.totalValue),
      taxableValue: round2(h.taxableValue),
      cgst: round2(h.cgst),
      sgst: round2(h.sgst),
      igst: round2(h.igst),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);

  const tallyVouchers: TallyDailyVoucher[] = [
    ...Array.from(tallyDailyMap.values())
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.ledger.localeCompare(b.ledger))
      .map((b, idx) => {
        const gross = round2(b.grossTotal);
        const taxable = round2(b.taxableSales);
        const cgst = round2(b.cgst);
        const sgst = round2(b.sgst);
        const packing = round2(b.packingCharges);
        const roundOffCredit = round2(gross - (taxable + cgst + sgst + packing));
        return {
          voucherKey: `${b.dateKey}-${idx}`,
          dateYyyymmdd: b.dateKey.replace(/-/g, ""),
          dateDisplay: b.dateKey,
          voucherType: "Sales" as const,
          voucherNumber: `BJ-${b.dateKey.replace(/-/g, "")}-${String(idx + 1).padStart(2, "0")}`,
          partyLedger: b.ledger,
          narration: `Daily ${b.ledger} sales (${b.billCount} bills)`,
          grossTotal: gross,
          taxableSales: taxable,
          cgst,
          sgst,
          igst: 0,
          packingCharges: packing,
          roundOffCredit,
        };
      }),
    ...corporateVouchers,
  ];

  const sortedBills = [...posOrdersForSeries].sort();
  const activeB2bNums = b2bRows.map((r) => r.invoiceNumber).sort();
  const docSummary: Gstr1DocSeriesRow[] = [
    {
      nature: "Invoices for outward supply (Counter & Online Bills)",
      srNoFrom: sortedBills[0] ?? "—",
      srNoTo: sortedBills[sortedBills.length - 1] ?? "—",
      totalNumber: sortedBills.length + input.cancelledOrdersCount,
      cancelled: input.cancelledOrdersCount,
      netIssued: sortedBills.length,
    },
    ...(activeB2bNums.length > 0
      ? [
          {
            nature: "Corporate B2B Tax Invoices",
            srNoFrom: activeB2bNums[0],
            srNoTo: activeB2bNums[activeB2bNums.length - 1],
            totalNumber: activeB2bNums.length,
            cancelled: 0,
            netIssued: activeB2bNums.length,
          },
        ]
      : []),
  ];

  const totals = {
    b2bTaxable: round2(b2bRows.reduce((s, r) => s + r.taxableValue, 0)),
    b2bTax: round2(b2bRows.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0)),
    b2bInvoiceValue: round2(b2bRows.reduce((s, r) => s + r.invoiceValue, 0)),
    b2csTaxable: round2(b2csRows.reduce((s, r) => s + r.taxableValue, 0)),
    b2csTax: round2(b2csRows.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0)),
    b2csGross: round2(b2csRows.reduce((s, r) => s + r.grossTotal, 0)),
    hsnTaxable: round2(hsnRows.reduce((s, r) => s + r.taxableValue, 0)),
    hsnTotalValue: round2(hsnRows.reduce((s, r) => s + r.totalValue, 0)),
  };

  return {
    restaurantName: input.restaurantName,
    outletGstin: input.outletGstin,
    placeOfSupply: posPlace,
    periodLabel: input.periodLabel,
    b2bRows,
    b2csRows,
    hsnRows,
    docSummary,
    tallyVouchers,
    ecoSec95: {
      orderCount: ecoCount,
      grossAmount: ecoGross,
      cgstNote:
        "Supplies through E-Commerce Operators where GST is paid u/s 9(5) by operator (Zomato/Swiggy); excluded from Table 7 liability.",
    },
    totals,
  };
}

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function serializeGstr1B2csCsv(report: CaAccountingReport): string {
  const headers = [
    "Type",
    "Place Of Supply",
    "Applicable % of Tax Rate",
    "Rate",
    "Taxable Value",
    "Cess Amount",
    "CGST",
    "SGST/UTGST",
    "E-Commerce GSTIN",
  ];
  const lines = [
    headers.join(","),
    ...report.b2csRows.map((r) =>
      [
        "OE",
        csvCell(r.placeOfSupply),
        "",
        r.rate,
        r.taxableValue.toFixed(2),
        "0.00",
        r.cgst.toFixed(2),
        r.sgst.toFixed(2),
        "",
      ].join(","),
    ),
  ];
  return lines.join("\n");
}

export function serializeGstr1B2bCsv(report: CaAccountingReport): string {
  const headers = [
    "GSTIN/UIN of Recipient",
    "Receiver Name",
    "Invoice Number",
    "Invoice date",
    "Invoice Value",
    "Place Of Supply",
    "Reverse Charge",
    "Invoice Type",
    "Rate",
    "Taxable Value",
    "CGST",
    "SGST",
    "IGST",
  ];
  const lines = [
    headers.join(","),
    ...report.b2bRows.map((r) =>
      [
        csvCell(r.recipientGstin),
        csvCell(r.receiverName),
        csvCell(r.invoiceNumber),
        csvCell(r.invoiceDate),
        r.invoiceValue.toFixed(2),
        csvCell(r.placeOfSupply),
        "N",
        "Regular B2B",
        r.rate,
        r.taxableValue.toFixed(2),
        r.cgst.toFixed(2),
        r.sgst.toFixed(2),
        r.igst.toFixed(2),
      ].join(","),
    ),
  ];
  return lines.join("\n");
}

export function serializeGstr1HsnCsv(report: CaAccountingReport): string {
  const headers = [
    "HSN",
    "Description",
    "UQC",
    "Total Quantity",
    "Total Value",
    "Rate",
    "Taxable Value",
    "Integrated Tax Amount",
    "Central Tax Amount",
    "State/UT Tax Amount",
    "Cess Amount",
  ];
  const lines = [
    headers.join(","),
    ...report.hsnRows.map((h) =>
      [
        csvCell(h.hsn),
        csvCell(h.description),
        csvCell(h.uqc),
        h.totalQty,
        h.totalValue.toFixed(2),
        h.rate,
        h.taxableValue.toFixed(2),
        h.igst.toFixed(2),
        h.cgst.toFixed(2),
        h.sgst.toFixed(2),
        "0.00",
      ].join(","),
    ),
  ];
  return lines.join("\n");
}

export function serializeGstr1DocsCsv(report: CaAccountingReport): string {
  const headers = [
    "Nature of Document",
    "Sr. No. From",
    "Sr. No. To",
    "Total Number",
    "Cancelled",
    "Net Issued",
  ];
  return [
    headers.join(","),
    ...report.docSummary.map((d) =>
      [
        csvCell(d.nature),
        csvCell(d.srNoFrom),
        csvCell(d.srNoTo),
        d.totalNumber,
        d.cancelled,
        d.netIssued,
      ].join(","),
    ),
  ].join("\n");
}

export function serializeGstr1Json(
  report: CaAccountingReport,
  filingPeriodMmYyyy: string,
): string {
  const stateCode = report.placeOfSupply.split("-")[0] || "36";
  const payload = {
    gstin: report.outletGstin ?? "",
    fp: filingPeriodMmYyyy,
    gt: report.totals.b2csGross + report.totals.b2bInvoiceValue,
    cur_gt: report.totals.b2csGross + report.totals.b2bInvoiceValue,
    b2b: report.b2bRows.map((r) => ({
      ctin: r.recipientGstin,
      inv: [
        {
          inum: r.invoiceNumber,
          idt: r.invoiceDate,
          val: r.invoiceValue,
          pos: r.placeOfSupply.split("-")[0] || stateCode,
          rchrg: "N",
          inv_typ: "R",
          itms: [
            {
              num: 1,
              itm_det: {
                rt: r.rate,
                txval: r.taxableValue,
                camt: r.cgst,
                samt: r.sgst,
                iamt: r.igst,
                csamt: 0,
              },
            },
          ],
        },
      ],
    })),
    b2cs: report.b2csRows.map((r) => ({
      sply_ty: "INTRA",
      rt: r.rate,
      typ: "OE",
      pos: r.placeOfSupply.split("-")[0] || stateCode,
      txval: r.taxableValue,
      camt: r.cgst,
      samt: r.sgst,
      csamt: 0,
    })),
    hsn: {
      data: report.hsnRows.map((h, idx) => ({
        num: idx + 1,
        hsn_sc: h.hsn,
        desc: h.description,
        uqc: h.uqc,
        qty: h.totalQty,
        rt: h.rate,
        val: h.totalValue,
        txval: h.taxableValue,
        iamt: h.igst,
        camt: h.cgst,
        samt: h.sgst,
        csamt: 0,
      })),
    },
    doc_issue: {
      doc_det: report.docSummary.map((d, idx) => ({
        doc_num: idx + 1,
        docs: [
          {
            num: 1,
            from: d.srNoFrom,
            to: d.srNoTo,
            totnum: d.totalNumber,
            cancel: d.cancelled,
            net_issue: d.netIssued,
          },
        ],
      })),
    },
  };
  return JSON.stringify(payload, null, 2);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function ledgerEntryXml(ledgerName: string, amount: number, isDeemedPositive: boolean): string {
  return [
    "      <ALLLEDGERENTRIES.LIST>",
    `        <LEDGERNAME>${escapeXml(ledgerName)}</LEDGERNAME>`,
    `        <ISDEEMEDPOSITIVE>${isDeemedPositive ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    `        <AMOUNT>${amount.toFixed(2)}</AMOUNT>`,
    "      </ALLLEDGERENTRIES.LIST>",
  ].join("\n");
}

export function serializeTallyPrimeXml(report: CaAccountingReport): string {
  const messages = report.tallyVouchers.map((v) => {
    const entries: string[] = [];
    // Debit side (negative in Tally XML convention)
    entries.push(ledgerEntryXml(v.partyLedger, -v.grossTotal, true));
    // Credit side (positive)
    if (Math.abs(v.taxableSales) > 0) {
      entries.push(ledgerEntryXml("Restaurant Sales", v.taxableSales, false));
    }
    if (Math.abs(v.cgst) > 0) {
      entries.push(ledgerEntryXml("Output CGST", v.cgst, false));
    }
    if (Math.abs(v.sgst) > 0) {
      entries.push(ledgerEntryXml("Output SGST", v.sgst, false));
    }
    if (Math.abs(v.igst) > 0) {
      entries.push(ledgerEntryXml("Output IGST", v.igst, false));
    }
    if (Math.abs(v.packingCharges) > 0) {
      entries.push(ledgerEntryXml("Packing Charges Recovered", v.packingCharges, false));
    }
    if (Math.abs(v.roundOffCredit) >= 0.01) {
      entries.push(
        ledgerEntryXml(
          "Round Off",
          v.roundOffCredit,
          v.roundOffCredit < 0,
        ),
      );
    }

    return [
      '        <TALLYMESSAGE xmlns:UDF="TallyUDF">',
      `          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
      `            <DATE>${escapeXml(v.dateYyyymmdd)}</DATE>`,
      `            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>`,
      `            <VOUCHERNUMBER>${escapeXml(v.voucherNumber)}</VOUCHERNUMBER>`,
      `            <PARTYLEDGERNAME>${escapeXml(v.partyLedger)}</PARTYLEDGERNAME>`,
      `            <NARRATION>${escapeXml(v.narration)}</NARRATION>`,
      "            <ISINVOICE>Yes</ISINVOICE>",
      entries.join("\n"),
      "          </VOUCHER>",
      "        </TALLYMESSAGE>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ENVELOPE>",
    "  <HEADER>",
    "    <TALLYREQUEST>Import Data</TALLYREQUEST>",
    "  </HEADER>",
    "  <BODY>",
    "    <IMPORTDATA>",
    "      <REQUESTDESC>",
    "        <REPORTNAME>Vouchers</REPORTNAME>",
    "        <STATICVARIABLES>",
    `          <SVCURRENTCOMPANY>${escapeXml(report.restaurantName)}</SVCURRENTCOMPANY>`,
    "        </STATICVARIABLES>",
    "      </REQUESTDESC>",
    "      <REQUESTDATA>",
    messages.join("\n"),
    "      </REQUESTDATA>",
    "    </IMPORTDATA>",
    "  </BODY>",
    "</ENVELOPE>",
  ].join("\n");
}
