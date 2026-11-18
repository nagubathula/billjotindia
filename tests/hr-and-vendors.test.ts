import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeEmployeePayroll, daysInYearMonth } from "@/lib/hr";
import {
  computePurchaseOrderTotals,
  derivePoPaymentStatus,
  isValidGstin,
} from "@/lib/vendors";

describe("Staff HR payroll & calendar calculations", () => {
  it("computes calendar days accurately including leap years", () => {
    assert.equal(daysInYearMonth("2024-02"), 29);
    assert.equal(daysInYearMonth("2026-02"), 28);
    assert.equal(daysInYearMonth("2026-11"), 30);
    assert.equal(daysInYearMonth("2026-12"), 31);
    assert.throws(() => daysInYearMonth("2026-13"));
  });

  it("prorates monthly salary by attendance, overtime, bonus, and advances", () => {
    // 30-day month, ₹30,000/month => ₹1,000/day, ₹125/OT hour
    const res = computeEmployeePayroll({
      payType: "monthly",
      basePay: 30_000,
      daysInMonth: 30,
      counts: {
        present: 20,
        halfDay: 2, // 1 payable day
        absent: 4,
        paidLeave: 2,
        weeklyOff: 2,
      },
      overtimeHours: 8,
      bonusAmount: 1500,
      advanceDeduction: 3000,
      otherDeduction: 500,
    });

    assert.equal(res.assumedFullMonth, false);
    assert.equal(res.payableDays, 25); // 20 + 2 + 2 + 0.5*2
    assert.equal(res.grossEarned, 25_000);
    assert.equal(res.overtimePay, 1000);
    assert.equal(res.netPayable, 24_000); // 25000 + 1000 + 1500 - 3000 - 500
  });

  it("defaults monthly staff to full-month pay when no attendance rows are marked", () => {
    const res = computeEmployeePayroll({
      payType: "monthly",
      basePay: 22_000,
      daysInMonth: 30,
      counts: {
        present: 0,
        halfDay: 0,
        absent: 0,
        paidLeave: 0,
        weeklyOff: 0,
      },
      overtimeHours: 0,
      advanceDeduction: 2000,
    });

    assert.equal(res.assumedFullMonth, true);
    assert.equal(res.payableDays, 30);
    assert.equal(res.grossEarned, 22_000);
    assert.equal(res.netPayable, 20_000);
  });

  it("computes daily-wage staff strictly from worked/paid days and clamps net at 0", () => {
    const res = computeEmployeePayroll({
      payType: "daily",
      basePay: 800,
      daysInMonth: 30,
      counts: {
        present: 5,
        halfDay: 1, // 0.5 day
        absent: 2,
        paidLeave: 0,
        weeklyOff: 2, // unpaid for daily wage
      },
      overtimeHours: 4, // 4 * (800 / 8) = 400
      advanceDeduction: 6000,
    });

    assert.equal(res.assumedFullMonth, false);
    assert.equal(res.payableDays, 5.5);
    assert.equal(res.grossEarned, 4400);
    assert.equal(res.overtimePay, 400);
    assert.equal(res.netPayable, 0); // clamped instead of negative
  });
});

describe("Vendor GSTIN, purchase order totals & payment status", () => {
  it("validates optional 15-character Indian GSTIN format", () => {
    assert.equal(isValidGstin(""), true);
    assert.equal(isValidGstin(null), true);
    assert.equal(isValidGstin("36AABCU9603R1ZM"), true);
    assert.equal(isValidGstin("29aaacc1206d1zb"), true);
    assert.equal(isValidGstin("INVALID123"), false);
    assert.equal(isValidGstin("36AABCU9603R1A1"), false); // missing Z in 14th char
  });

  it("computes PO item subtotals, GST, totals, and payment statuses accurately", () => {
    const po = computePurchaseOrderTotals([
      { name: "Aged Basmati Rice", unit: "kg", qty: 50, unit_cost: 120, gst_rate: 5 },
      { name: "Biryani Boxes", unit: "pcs", qty: 200, unit_cost: 10, gst_rate: 18 },
      { name: "", unit: "kg", qty: 5, unit_cost: 100, gst_rate: 5 }, // skipped blank
    ]);

    assert.equal(po.items.length, 2);
    assert.equal(po.subtotal, 8000); // 6000 + 2000
    assert.equal(po.gstAmount, 660); // 300 + 360
    assert.equal(po.totalAmount, 8660);

    assert.equal(derivePoPaymentStatus(8660, 0), "unpaid");
    assert.equal(derivePoPaymentStatus(8660, 4000), "partial");
    assert.equal(derivePoPaymentStatus(8660, 8660), "paid");
  });
});
