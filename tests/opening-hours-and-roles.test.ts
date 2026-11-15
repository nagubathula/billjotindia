import test from "node:test";
import assert from "node:assert/strict";
import { isOutletOpen } from "@/lib/opening-hours";
import {
  canManageStaff,
  canOpenAdmin,
  canOpenKitchenBoard,
  canOpenPos,
  canTakeNonTableOrders,
  canTakePayment,
  canVoidSentItems,
} from "@/lib/roles";

test("isOutletOpen handles daytime, split lunch/dinner, closed days, and overnight spillover", () => {
  const hours = {
    mon: [
      { open: "12:00", close: "15:00" },
      { open: "19:00", close: "23:00" },
    ],
    tue: [],
    fri: [{ open: "18:00", close: "02:00" }],
    sat: [{ open: "11:00", close: "23:00" }],
  };

  // Monday 13:30 IST (08:00 UTC on 2026-11-16, which is a Monday)
  const monLunch = new Date("2026-11-16T08:00:00Z");
  assert.equal(isOutletOpen(hours, "Asia/Kolkata", monLunch).open, true);

  // Monday 17:00 IST (11:30 UTC on 2026-11-16) — between lunch and dinner
  const monBreak = new Date("2026-11-16T11:30:00Z");
  const breakStatus = isOutletOpen(hours, "Asia/Kolkata", monBreak);
  assert.equal(breakStatus.open, false);
  assert.equal(breakStatus.nextOpen, "today at 19:00");

  // Tuesday 13:00 IST (07:30 UTC on 2026-11-17) — closed all day
  const tueAfternoon = new Date("2026-11-17T07:30:00Z");
  assert.equal(isOutletOpen(hours, "Asia/Kolkata", tueAfternoon).open, false);

  // Saturday 01:15 IST (19:45 UTC on Friday 2026-11-20) — open via Friday's 18:00–02:00 spillover!
  const satLateNight = new Date("2026-11-20T19:45:00Z");
  assert.equal(isOutletOpen(hours, "Asia/Kolkata", satLateNight).open, true);

  // Null / unconfigured hours -> open by default
  assert.equal(isOutletOpen(null, "Asia/Kolkata", monBreak).open, true);
});

test("RBAC role helpers enforce Captain, Cashier, Manager, and Admin boundaries", () => {
  // Captain: POS + KDS, Dine-in tables only, no payments, no voiding sent items, no admin
  assert.equal(canOpenPos("captain"), true);
  assert.equal(canOpenKitchenBoard("captain"), true);
  assert.equal(canTakePayment("captain"), false);
  assert.equal(canTakeNonTableOrders("captain"), false);
  assert.equal(canVoidSentItems("captain"), false);
  assert.equal(canOpenAdmin("captain"), false);

  // Cashier ('user'): POS + KDS + payments + takeaway/delivery, no voiding sent items, no admin
  assert.equal(canOpenPos("user"), true);
  assert.equal(canOpenKitchenBoard("user"), true);
  assert.equal(canTakePayment("user"), true);
  assert.equal(canTakeNonTableOrders("user"), true);
  assert.equal(canVoidSentItems("user"), false);
  assert.equal(canOpenAdmin("user"), false);

  // Manager: POS + KDS + payments + voiding sent items + admin, no staff management
  assert.equal(canVoidSentItems("manager"), true);
  assert.equal(canOpenAdmin("manager"), true);
  assert.equal(canManageStaff("manager"), false);

  // Admin: full permissions including staff management
  assert.equal(canVoidSentItems("admin"), true);
  assert.equal(canManageStaff("admin"), true);
});
