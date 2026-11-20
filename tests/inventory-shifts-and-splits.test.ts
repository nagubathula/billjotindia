import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDishFoodCost,
  computeOrderMaterialDeductions,
  computeRecipeLineCost,
  computeWeightedAverageCost,
  matchPoItemToMaterial,
} from "@/lib/inventory";
import {
  computeDrawerReconciliation,
  formatOrderTenderLabel,
  resolveOrderPaymentMode,
  summarizeRegisterOrders,
  validateSplitAllocations,
} from "@/lib/register";

test("lib/inventory: weighted average cost, recipe BOM cost, order deductions & PO matching", () => {
  // Initial 10 kg @ ₹100 + GRN 10 kg @ ₹140 -> weighted average ₹120/kg
  assert.equal(computeWeightedAverageCost(10, 100, 10, 140), 120);
  // Starting from zero stock takes new unit cost directly
  assert.equal(computeWeightedAverageCost(0, 90, 5, 160), 160);

  // 0.20 kg with 10% wastage at ₹500/kg -> 0.22 * 500 = ₹110
  assert.equal(computeRecipeLineCost(0.2, 10, 500), 110);

  const foodMargin = computeDishFoodCost(
    [
      { quantityPerUnit: 0.2, wastagePct: 10, materialUnitCost: 500 },
      { quantityPerUnit: 1, wastagePct: 0, materialUnitCost: 15 },
    ],
    450,
  );
  assert.equal(foodMargin.foodCost, 125);
  assert.equal(foodMargin.margin, 325);
  assert.equal(foodMargin.foodCostPct, 28);

  const recipes = new Map([
    [
      "prod-biryani",
      [
        { materialId: "mat-rice", quantityPerUnit: 0.16, wastagePct: 5 },
        { materialId: "mat-box", quantityPerUnit: 1, wastagePct: 0 },
      ],
    ],
  ]);
  const deductions = computeOrderMaterialDeductions(
    [{ productId: "prod-biryani", quantity: 3 }],
    recipes,
  );
  assert.deepEqual(deductions, [
    { materialId: "mat-box", totalRequired: 3 },
    { materialId: "mat-rice", totalRequired: 0.504 },
  ]);

  const mats = [
    { id: "m1", sku: "RM-GR01", name: "Aged Basmati Rice" },
    { id: "m2", sku: "RM-004", name: "Tender Goat Mutton" },
  ];
  assert.equal(matchPoItemToMaterial("RM-GR01: Aged Rice", mats)?.id, "m1");
  assert.equal(matchPoItemToMaterial("aged basmati rice", mats)?.id, "m1");
  assert.equal(matchPoItemToMaterial("Goat Mutton (2kg)", mats)?.id, "m2");
  assert.equal(matchPoItemToMaterial("Sparkling Water", mats), null);
});

test("lib/register: split tender validation, payment mode resolution, Z-drawer variance & receipts", () => {
  const validSplit = validateSplitAllocations(1200, [
    { mode: "cash", amount: 500 },
    { mode: "upi", amount: 700 },
  ]);
  assert.equal(validSplit.ok, true);
  if (validSplit.ok) {
    assert.equal(validSplit.normalized.length, 2);
  }

  const badSplit = validateSplitAllocations(1200, [
    { mode: "cash", amount: 400 },
    { mode: "upi", amount: 700 },
  ]);
  assert.equal(badSplit.ok, false);

  assert.equal(
    resolveOrderPaymentMode({
      source: "pos",
      payment_mode: null,
      customer_email: "pos+upi@billjot.local",
    }),
    "upi",
  );
  assert.equal(
    resolveOrderPaymentMode({
      source: "pos",
      payment_mode: "split",
      customer_email: "guest@example.com",
    }),
    "split",
  );

  assert.equal(
    formatOrderTenderLabel(
      { source: "pos", payment_mode: "split", customer_email: "guest@example.com" },
      [
        { payment_mode: "cash", amount: 500 },
        { payment_mode: "upi", amount: 700 },
      ],
    ),
    "CASH ₹500 + UPI ₹700",
  );

  const paymentsMap = new Map([
    [
      "o-split",
      [
        { order_id: "o-split", payment_mode: "cash", amount: 500 },
        { order_id: "o-split", payment_mode: "upi", amount: 700 },
      ],
    ],
  ]);

  const summary = summarizeRegisterOrders(
    [
      {
        id: "o-open",
        source: "pos",
        status: "pending",
        customer_name: "T-01",
        customer_email: "pos+open@billjot.local",
        total_amount: 450,
      },
      {
        id: "o-split",
        source: "pos",
        status: "completed",
        customer_name: "T-04 · Guest",
        customer_email: "guest@example.com",
        payment_mode: "split",
        total_amount: 1200,
        cgst_amount: 28.57,
        sgst_amount: 28.57,
      },
      {
        id: "o-tab",
        source: "pos",
        status: "pending",
        customer_name: "Arjun",
        customer_email: "pos+tab@billjot.local",
        total_amount: 800,
      },
    ],
    paymentsMap,
  );

  assert.equal(summary.openTablesCount, 1);
  assert.equal(summary.openTablesAmount, 450);
  assert.equal(summary.totalOrders, 2);
  assert.equal(summary.cashSales, 500);
  assert.equal(summary.upiSales, 700);
  assert.equal(summary.tabSales, 800);

  const rec = computeDrawerReconciliation({
    openingFloat: 5000,
    cashSales: 500,
    cashPettyExpenses: 200,
    denominations: { 500: 10, 200: 1, 100: 1 },
  });
  assert.equal(rec.expectedCash, 5300);
  assert.equal(rec.countedCash, 5300);
  assert.equal(rec.variance, 0);
});
