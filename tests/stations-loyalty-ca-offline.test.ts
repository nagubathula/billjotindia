import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildEscPosDrawerKickBytes,
  buildEscPosKotBytes,
  buildEscPosReceiptBytes,
} from "@/lib/escpos";
import { groupOrderItemsByStation } from "@/lib/kot-routing";
import {
  buildCaAccountingReport,
  serializeGstr1B2bCsv,
  serializeGstr1B2csCsv,
  serializeGstr1HsnCsv,
  serializeGstr1Json,
  serializeTallyPrimeXml,
} from "@/lib/ca-exports";
import {
  computeEarnedPoints,
  computeMaxRedeemablePoints,
  DEFAULT_LOYALTY_SETTINGS,
  normalizeLoyaltyPhone,
} from "@/lib/loyalty";
import {
  isNetworkFailure,
  makeLocalOfflineBillNumber,
  makeOfflineOrderId,
} from "@/lib/pos-offline";
import type {
  CorporateClient,
  CorporateInvoice,
  Order,
  OrderItem,
} from "@/lib/types";

test("lib/escpos: builds 80mm/58mm receipts, price-free KOTs & RJ11 drawer kick bytes", () => {
  const kick = buildEscPosDrawerKickBytes();
  assert.deepEqual(Array.from(kick), [0x1b, 0x70, 0x00, 0x19, 0xfa]);

  const receipt = buildEscPosReceiptBytes({
    outletName: "Manaruchulu Jubilee",
    gstin: "36AABCM1234F1Z5",
    billNumber: "BJ-1001",
    source: "pos",
    tokenNumber: 108,
    placedAtLabel: "21 Nov 2026",
    orderType: "dine-in",
    tenderLabel: "Cash ₹300 + UPI ₹200",
    items: [{ name: "Gongura Biryani", quantity: 1, totalPrice: 380 }],
    subtotal: 361.9,
    cgst: 9.05,
    sgst: 9.05,
    loyaltyPointsRedeemed: 25,
    loyaltyDiscountAmount: 25,
    loyaltyPointsEarned: 17,
    totalAmount: 355,
    kickDrawer: true,
  });
  const receiptAscii = Buffer.from(receipt).toString("latin1");
  assert.ok(receiptAscii.includes("Manaruchulu Jubilee"));
  assert.ok(receiptAscii.includes("TOKEN 108"));
  assert.ok(receiptAscii.includes("Loyalty (25p)"));
  assert.ok(receiptAscii.includes("Earned +17 loyalty pts"));
  // Trailing ESC p kick sequence
  assert.deepEqual(Array.from(receipt.slice(-5)), [0x1b, 0x70, 0x00, 0x19, 0xfa]);

  const kot = buildEscPosKotBytes({
    outletName: "Manaruchulu",
    stationName: "Tandoor & Grill",
    billNumber: "T-04",
    tokenNumber: 204,
    tableLabel: "T-04",
    orderType: "dine-in",
    kotRound: 2,
    placedAtLabel: "20:15",
    items: [
      {
        name: "Butter Naan",
        quantity: 3,
        modifiers: ["Garlic Butter"],
        instructions: "Well done",
      },
    ],
    paperWidth: 58,
  });
  const kotAscii = Buffer.from(kot).toString("latin1");
  assert.ok(kotAscii.includes("KOT - TANDOOR & GRILL"));
  assert.ok(kotAscii.includes("ADD-ON KOT ROUND #2"));
  assert.ok(kotAscii.includes("3x Butter Naan"));
  assert.ok(!kotAscii.includes("SUBTOTAL"));
});

test("lib/kot-routing: resolves product overrides, category fallback & skips No-KOT items", () => {
  const productsById = new Map([
    [
      "p-biryani",
      { id: "p-biryani", category: "Biryani", station_id: null, is_kot_required: true },
    ],
    [
      "p-naan",
      { id: "p-naan", category: "Breads", station_id: "st-tandoor", is_kot_required: true },
    ],
    [
      "p-water",
      { id: "p-water", category: "Beverages", station_id: "st-bar", is_kot_required: false },
    ],
  ]);
  const catStations = new Map<string, string | null>([
    ["biryani", "st-main"],
    ["breads", "st-main"],
  ]);
  const stationsById = new Map([
    ["st-main", { id: "st-main", name: "Main Kitchen", printer_id: "pr-1" }],
    ["st-tandoor", { id: "st-tandoor", name: "Tandoor & Grill", printer_id: "pr-2" }],
    ["st-bar", { id: "st-bar", name: "Beverage & Bar", printer_id: "pr-3" }],
  ]);

  const groups = groupOrderItemsByStation({
    items: [
      { id: "oi1", quantity: 1, instructions: null, productId: "p-biryani", name: "Biryani" },
      { id: "oi2", quantity: 2, instructions: null, productId: "p-naan", name: "Naan" },
      { id: "oi3", quantity: 1, instructions: null, productId: "p-water", name: "Water Bottle" },
    ],
    productsById,
    categoryStationByName: catStations,
    stationsById,
  });

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => ({ station: g.stationName, count: g.items.length })),
    [
      { station: "Main Kitchen", count: 1 },
      { station: "Tandoor & Grill", count: 1 },
    ],
  );
});

test("lib/ca-exports: GSTR-1 B2CS/B2B/HSN deduplication, Sec 9(5) & zero-balanced Tally XML", () => {
  const baseOrder: Order = {
    id: "ord-1",
    outlet_id: "out-1",
    table_id: null,
    customer_account_id: null,
    cashier_id: null,
    source: "pos",
    order_type: "dine-in",
    customer_name: "Walk-in",
    customer_email: "pos+cash@billjot.local",
    customer_phone: null,
    payment_mode: "cash",
    payment_status: "paid",
    payment_provider: null,
    subtotal: 200,
    cgst_amount: 5,
    sgst_amount: 5,
    igst_amount: 0,
    gst_paid_by_operator: false,
    takeaway_charges: 0,
    delivery_charges: 0,
    discount_amount: 0,
    loyalty_points_redeemed: 0,
    loyalty_discount_amount: 0,
    loyalty_points_earned: 0,
    platform_discount: 0,
    commission_amount: 0,
    net_payout: null,
    rounding_amount: 0,
    total_amount: 210,
    status: "completed",
    placed_at: "2026-11-20T12:00:00.000Z",
    created_at: "2026-11-20T12:00:00.000Z",
    updated_at: "2026-11-20T12:00:00.000Z",
    unique_order_id: "BJ-1001",
    daily_order_number: 1,
    token_number: 101,
    instructions: null,
    cancel_reason: null,
    cancel_note: null,
    cancel_product_ids: [],
    cancelled_by: null,
    cancelled_at: null,
    external_order_id: null,
    external_status: null,
    external_payload: null,
    razorpay_order_id: null,
    stripe_session_id: null,
    delivery_partner: null,
    offline_id: null,
    offline_synced_at: null,
    voided_items: [],
  };

  const b2bLinkedOrder: Order = {
    ...baseOrder,
    id: "ord-2-corp",
    unique_order_id: "BJ-1002",
    customer_email: "pos+tab@billjot.local",
    payment_mode: "tab",
    total_amount: 1050,
  };

  const zomatoOrder: Order = {
    ...baseOrder,
    id: "ord-3-zomato",
    unique_order_id: "BJ-1003",
    source: "zomato",
    payment_mode: "aggregator",
    gst_paid_by_operator: true,
    total_amount: 500,
  };

  const items: OrderItem[] = [
    {
      id: "it-1",
      order_id: "ord-1",
      quantity: 2,
      unit_price: 105,
      total_price: 210,
      instructions: null,
      product_config: {
        product_id: "p-1",
        name: "Masala Dosa",
        base_price: 105,
        gst_rate: 5,
        hsn_code: "996331",
      },
      created_at: "2026-11-20T12:00:00.000Z",
    },
    {
      id: "it-2",
      order_id: "ord-2-corp",
      quantity: 10,
      unit_price: 105,
      total_price: 1050,
      instructions: null,
      product_config: {
        product_id: "p-1",
        name: "Masala Dosa",
        base_price: 105,
        gst_rate: 5,
        hsn_code: "996331",
      },
      created_at: "2026-11-20T12:00:00.000Z",
    },
  ];

  const corpClient: CorporateClient = {
    id: "cli-1",
    restaurant_id: "rest-1",
    company_name: "Acme Tech Pvt Ltd",
    gstin: "36AAACA1234F1Z5",
    state_code: "36",
    state_name: "Telangana",
    contact_person: null,
    phone: null,
    email: null,
    billing_address: null,
    credit_limit: 50000,
    payment_terms: "net_15",
    notes: null,
    status: "active",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  };

  const corpInv: CorporateInvoice = {
    id: "inv-1",
    restaurant_id: "rest-1",
    outlet_id: "out-1",
    corporate_client_id: "cli-1",
    invoice_number: "INV-2026-001",
    invoice_date: "2026-11-20",
    due_date: "2026-12-05",
    supply_type: "intra_state",
    place_of_supply: "36-Telangana",
    po_reference: null,
    line_items: [],
    linked_order_ids: ["ord-2-corp"],
    taxable_subtotal: 1000,
    cgst_amount: 25,
    sgst_amount: 25,
    igst_amount: 0,
    total_amount: 1050,
    amount_paid: 0,
    payment_status: "unpaid",
    status: "issued",
    notes: null,
    created_at: "2026-11-20T12:00:00Z",
    updated_at: "2026-11-20T12:00:00Z",
  };

  const report = buildCaAccountingReport({
    restaurantName: "Manaruchulu Hospitality",
    outletGstin: "36AABCM1234F1Z5",
    timeZone: "Asia/Kolkata",
    periodLabel: "November 2026",
    orders: [baseOrder, b2bLinkedOrder, zomatoOrder],
    orderItems: items,
    cancelledOrdersCount: 1,
    corporateInvoices: [corpInv],
    corporateClients: [corpClient],
  });

  // B2CS should include only ord-1 (210 gross = 200 taxable + 10 GST); ord-2-corp goes to B2B; ord-3 goes to Sec 9(5)
  assert.equal(report.b2csRows.length, 1);
  assert.equal(report.b2csRows[0].taxableValue, 200);
  assert.equal(report.b2csRows[0].cgst, 5);
  assert.equal(report.b2csRows[0].sgst, 5);
  assert.equal(report.b2bRows.length, 1);
  assert.equal(report.ecoSec95.orderCount, 1);
  assert.equal(report.ecoSec95.grossAmount, 500);

  // Verify every Tally voucher balances to 0.00 exactly
  assert.ok(report.tallyVouchers.length >= 2);
  for (const v of report.tallyVouchers) {
    const netBalance =
      -v.grossTotal +
      v.taxableSales +
      v.cgst +
      v.sgst +
      v.igst +
      v.packingCharges +
      v.roundOffCredit;
    assert.ok(
      Math.abs(netBalance) < 0.001,
      `Voucher ${v.voucherNumber} unbalanced: ${netBalance}`,
    );
  }

  assert.ok(serializeGstr1HsnCsv(report).includes("996331"));
  assert.ok(serializeGstr1B2csCsv(report).includes("36-Telangana"));
  assert.ok(serializeGstr1B2bCsv(report).includes("36AAACA1234F1Z5"));
  assert.ok(JSON.parse(serializeGstr1Json(report, "112026")).fp === "112026");

  const xml = serializeTallyPrimeXml(report);
  assert.ok(xml.includes("<TALLYREQUEST>Import Data</TALLYREQUEST>"));
  assert.ok(xml.includes("INV-2026-001"));
});

test("lib/loyalty & lib/pos-offline + sw.js POS nav caching", () => {
  assert.equal(normalizeLoyaltyPhone("+91 98765-43210"), "9876543210");
  assert.equal(normalizeLoyaltyPhone("09848012345"), "9848012345");
  assert.equal(normalizeLoyaltyPhone("12345"), null);

  const settings = {
    restaurant_id: "r1",
    ...DEFAULT_LOYALTY_SETTINGS,
    created_at: "",
    updated_at: "",
  };
  const cap = computeMaxRedeemablePoints({
    balance: 200,
    orderSubtotal: 600,
    settings,
  });
  // Max 25% of ₹600 = ₹150 => 150 pts
  assert.equal(cap.eligible, true);
  assert.equal(cap.maxPoints, 150);
  assert.equal(cap.rupeeDiscount, 150);

  const earnFirst = computeEarnedPoints({
    netPaidAmount: 540,
    isFirstVisit: true,
    settings,
  });
  // Floor(540/100 * 5) = 27 + 25 welcome bonus = 52
  assert.equal(earnFirst.earnedPoints, 27);
  assert.equal(earnFirst.welcomeBonus, 25);
  assert.equal(earnFirst.totalCredited, 52);

  assert.match(makeOfflineOrderId(), /^off_\d+_[a-z0-9]+$/);
  assert.match(makeLocalOfflineBillNumber(new Date("2026-11-21T10:15:30Z")), /^OFF-/);
  assert.equal(isNetworkFailure(new TypeError("Failed to fetch"), true), true);
  assert.equal(isNetworkFailure(new Error("Validation failed"), false), true);
  assert.equal(isNetworkFailure(new Error("Validation failed"), true), false);

  const sw = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");
  assert.ok(sw.includes("POS_NAV_CACHE"));
});
