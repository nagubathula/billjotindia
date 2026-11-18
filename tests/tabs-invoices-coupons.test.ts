import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountInWordsInr,
  checkTabCreditLimit,
  computeCorporateInvoiceTotals,
  computeDueDate,
  computeInvoicePaymentStatus,
  computeTabNextBalance,
} from "@/lib/accounts";
import { evaluateCouponDiscount, formatCouponOfferLabel } from "@/lib/coupons";

describe("Coupons engine", () => {
  it("computes percentage discount with max_discount cap", () => {
    const res = evaluateCouponDiscount(
      {
        code: "andhra10",
        title: "10% off up to ₹100",
        discount_type: "percentage",
        discount_value: 10,
        max_discount: 100,
        min_order_amount: 399,
        channel: "all",
        is_active: true,
      },
      1500,
    );
    assert.equal(res.ok, true);
    assert.equal(res.code, "ANDHRA10");
    assert.equal(res.discount, 100);
  });

  it("enforces min bill, expiry, usage cap, pause, and channel rules", () => {
    const lowBill = evaluateCouponDiscount(
      {
        code: "WELCOME50",
        title: "Flat 50",
        discount_type: "flat",
        discount_value: 50,
        min_order_amount: 300,
        is_active: true,
      },
      250,
    );
    assert.equal(lowBill.ok, false);
    assert.equal(lowBill.discount, 0);

    const expired = evaluateCouponDiscount(
      {
        code: "OLD10",
        title: "Expired",
        discount_type: "flat",
        discount_value: 50,
        expires_at: "2020-01-01T00:00:00Z",
        is_active: true,
      },
      500,
      { now: new Date("2026-11-19T00:00:00Z") },
    );
    assert.equal(expired.ok, false);

    const maxedOut = evaluateCouponDiscount(
      {
        code: "LIM5",
        title: "Limited",
        discount_type: "flat",
        discount_value: 40,
        usage_limit: 5,
        used_count: 5,
        is_active: true,
      },
      500,
    );
    assert.equal(maxedOut.ok, false);

    const wrongChannel = evaluateCouponDiscount(
      {
        code: "POSONLY",
        title: "POS only",
        discount_type: "flat",
        discount_value: 50,
        channel: "pos",
        is_active: true,
      },
      500,
      { channel: "storefront" },
    );
    assert.equal(wrongChannel.ok, false);

    assert.equal(
      formatCouponOfferLabel({
        discount_type: "percentage",
        discount_value: 15,
        max_discount: 150,
        min_order_amount: 450,
      }),
      "15% OFF up to ₹150 above ₹450",
    );
  });
});

describe("People's Tabs & Corporate GST Invoices", () => {
  it("updates running Khata balances and checks credit limits", () => {
    const afterCharge = computeTabNextBalance(1200, "charge", 850.5);
    assert.equal(afterCharge, 2050.5);

    const afterPay = computeTabNextBalance(afterCharge, "payment", 1000);
    assert.equal(afterPay, 1050.5);

    const limitOk = checkTabCreditLimit(4000, 5000, 1000);
    assert.equal(limitOk.withinLimit, true);
    assert.equal(limitOk.overBy, 0);

    const limitOver = checkTabCreditLimit(4200, 5000, 1100);
    assert.equal(limitOver.withinLimit, false);
    assert.equal(limitOver.overBy, 300);
  });

  it("computes intra-state CGST+SGST and inter-state IGST B2B invoices", () => {
    const intra = computeCorporateInvoiceTotals(
      [
        {
          description: "Executive Catering",
          hsn_sac: "996331",
          qty: 20,
          unit_price: 400,
          gst_rate: 5,
        },
        {
          description: "Event Equipment Setup",
          hsn_sac: "996339",
          qty: 1,
          unit_price: 2000,
          gst_rate: 18,
        },
      ],
      "intra",
    );

    assert.equal(intra.taxableSubtotal, 10_000);
    // 5% of 8000 = 400 (200+200) + 18% of 2000 = 360 (180+180)
    assert.equal(intra.cgstAmount, 380);
    assert.equal(intra.sgstAmount, 380);
    assert.equal(intra.igstAmount, 0);
    assert.equal(intra.totalAmount, 10_760);

    const inter = computeCorporateInvoiceTotals(
      [
        {
          description: "Executive Catering",
          qty: 10,
          unit_price: 500,
          gst_rate: 5,
        },
      ],
      "inter",
    );
    assert.equal(inter.taxableSubtotal, 5000);
    assert.equal(inter.cgstAmount, 0);
    assert.equal(inter.sgstAmount, 0);
    assert.equal(inter.igstAmount, 250);
    assert.equal(inter.totalAmount, 5250);
  });

  it("derives due dates, payment statuses, and INR amount words", () => {
    assert.equal(computeDueDate("2026-11-19", "net_15"), "2026-12-04");
    assert.equal(computeDueDate("2026-11-19", "due_on_receipt"), "2026-11-19");

    assert.equal(computeInvoicePaymentStatus(5000, 0), "unpaid");
    assert.equal(computeInvoicePaymentStatus(5000, 2500), "partial");
    assert.equal(computeInvoicePaymentStatus(5000, 5000), "paid");

    assert.equal(
      amountInWordsInr(10760),
      "Rupees Ten Thousand Seven Hundred Sixty Only",
    );
    assert.equal(
      amountInWordsInr(125432.5),
      "Rupees One Lakh Twenty Five Thousand Four Hundred Thirty Two and Fifty Paise Only",
    );
  });
});
