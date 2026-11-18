"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import {
  computeEmployeePayroll,
  daysInYearMonth,
  HR_ATTENDANCE_STATUSES,
  HR_DEPARTMENTS,
  HR_EMPLOYEE_STATUSES,
  HR_EMPLOYMENT_TYPES,
  HR_PAY_TYPES,
  HR_PAYMENT_MODES,
  isValidIsoDate,
  isValidYearMonth,
  type AttendanceCounts,
  type HrAttendanceStatus,
  type HrDepartment,
  type HrEmployeeStatus,
  type HrEmploymentType,
  type HrPaymentMode,
  type HrPayType,
} from "@/lib/hr";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

async function opsContext(slug: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;
  const { user, role } = await requireRole(["admin", "manager"], {
    restaurantId: restaurant.id,
    redirectTo: `/r/${slug}/admin/hr`,
  });
  return { restaurant, user, role };
}

async function adminOnlyContext(slug: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;
  const { user } = await requireRole(["admin"], {
    restaurantId: restaurant.id,
    redirectTo: `/r/${slug}/admin/hr`,
  });
  return { restaurant, user };
}

function isInEnum<T extends readonly { value: string }[]>(
  list: T,
  val: string,
): val is T[number]["value"] {
  return list.some((item) => item.value === val);
}

async function nextEmployeeCode(
  admin: ReturnType<typeof createAdminClient>,
  restaurantId: string,
): Promise<string> {
  const { data } = await admin
    .from("hr_employees")
    .select("employee_code")
    .eq("restaurant_id", restaurantId);
  let maxNum = 0;
  for (const row of data ?? []) {
    const m = /^EMP-(\d+)$/i.exec(row.employee_code.trim());
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  return `EMP-${String(maxNum + 1).padStart(3, "0")}`;
}

export async function saveEmployeeAction(
  slug: string,
  input: {
    id?: string | null;
    employeeCode?: string | null;
    fullName: string;
    phone?: string | null;
    email?: string | null;
    department: string;
    designation: string;
    employmentType: string;
    shiftName?: string | null;
    payType: string;
    basePay: number;
    outletId?: string | null;
    upiOrBank?: string | null;
    govtIdNote?: string | null;
    joinedOn?: string | null;
    status: string;
  },
): Promise<Result> {
  const ctx = await opsContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };

  const fullName = input.fullName.trim();
  const designation = input.designation.trim();
  if (!fullName || fullName.length > 120) {
    return { ok: false, error: "Enter the staff member's full name." };
  }
  if (!designation || designation.length > 80) {
    return { ok: false, error: "Enter a designation (e.g. Head Chef, Steward)." };
  }
  if (!isInEnum(HR_DEPARTMENTS, input.department)) {
    return { ok: false, error: "Choose a valid department." };
  }
  if (!isInEnum(HR_EMPLOYMENT_TYPES, input.employmentType)) {
    return { ok: false, error: "Choose a valid employment type." };
  }
  if (!isInEnum(HR_PAY_TYPES, input.payType)) {
    return { ok: false, error: "Choose Monthly Salary or Daily Wage." };
  }
  if (!isInEnum(HR_EMPLOYEE_STATUSES, input.status)) {
    return { ok: false, error: "Choose a valid employee status." };
  }

  const basePay = round2(Number(input.basePay));
  if (!Number.isFinite(basePay) || basePay < 0 || basePay > 10_000_000) {
    return { ok: false, error: "Enter a valid base pay amount (₹0 or above)." };
  }

  const joinedOn = input.joinedOn?.trim() || new Date().toISOString().slice(0, 10);
  if (!isValidIsoDate(joinedOn)) {
    return { ok: false, error: "Enter a valid joining date." };
  }

  const admin = createAdminClient();
  let outletId: string | null = null;
  if (input.outletId && input.outletId !== "__all__") {
    if (!isUuid(input.outletId)) {
      return { ok: false, error: "Selected outlet is invalid." };
    }
    const { data: outlet } = await admin
      .from("outlets")
      .select("id")
      .eq("id", input.outletId)
      .eq("restaurant_id", ctx.restaurant.id)
      .maybeSingle();
    if (!outlet) {
      return { ok: false, error: "Outlet does not belong to this restaurant." };
    }
    outletId = outlet.id;
  }

  const cleanCode = input.employeeCode?.trim().toUpperCase() || "";
  if (cleanCode.length > 24) {
    return { ok: false, error: "Keep employee code under 24 characters." };
  }

  const commonPayload = {
    outlet_id: outletId,
    full_name: fullName,
    phone: input.phone?.trim().slice(0, 30) || null,
    email: input.email?.trim().slice(0, 120) || null,
    department: input.department as HrDepartment,
    designation,
    employment_type: input.employmentType as HrEmploymentType,
    shift_name: input.shiftName?.trim().slice(0, 40) || "General",
    pay_type: input.payType as HrPayType,
    base_pay: basePay,
    upi_or_bank: input.upiOrBank?.trim().slice(0, 160) || null,
    govt_id_note: input.govtIdNote?.trim().slice(0, 120) || null,
    joined_on: joinedOn,
    status: input.status as HrEmployeeStatus,
  };

  if (input.id) {
    if (!isUuid(input.id)) return { ok: false, error: "Invalid employee ID." };
    const { data: existing } = await admin
      .from("hr_employees")
      .select("id, employee_code")
      .eq("id", input.id)
      .eq("restaurant_id", ctx.restaurant.id)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Employee not found." };

    const { error } = await admin
      .from("hr_employees")
      .update({
        ...commonPayload,
        employee_code: cleanCode || existing.employee_code,
      })
      .eq("id", existing.id)
      .eq("restaurant_id", ctx.restaurant.id);
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Another staff member already uses that employee code." };
      }
      return { ok: false, error: error.message };
    }
  } else {
    const code = cleanCode || (await nextEmployeeCode(admin, ctx.restaurant.id));
    const { error } = await admin.from("hr_employees").insert({
      restaurant_id: ctx.restaurant.id,
      employee_code: code,
      ...commonPayload,
    });
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Employee code already exists in this restaurant." };
      }
      return { ok: false, error: error.message };
    }
  }

  revalidatePath(`/r/${slug}/admin/hr`);
  return { ok: true };
}

export async function deleteEmployeeAction(
  slug: string,
  employeeId: string,
): Promise<Result> {
  const ctx = await adminOnlyContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(employeeId)) return { ok: false, error: "Employee not found." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("hr_employees")
    .delete()
    .eq("id", employeeId)
    .eq("restaurant_id", ctx.restaurant.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/hr`);
  return { ok: true };
}

export async function markAttendanceAction(
  slug: string,
  input: {
    employeeId: string;
    workDate: string;
    status: string;
    checkIn?: string | null;
    checkOut?: string | null;
    overtimeHours?: number | null;
    note?: string | null;
  },
): Promise<Result> {
  const ctx = await opsContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(input.employeeId)) return { ok: false, error: "Invalid employee." };
  if (!isValidIsoDate(input.workDate)) return { ok: false, error: "Invalid date." };
  if (!isInEnum(HR_ATTENDANCE_STATUSES, input.status)) {
    return { ok: false, error: "Invalid attendance status." };
  }

  const checkIn = input.checkIn?.trim() || null;
  const checkOut = input.checkOut?.trim() || null;
  if (checkIn && !TIME_RE.test(checkIn)) {
    return { ok: false, error: "Invalid check-in time." };
  }
  if (checkOut && !TIME_RE.test(checkOut)) {
    return { ok: false, error: "Invalid check-out time." };
  }

  const ot = round2(Number(input.overtimeHours ?? 0));
  if (!Number.isFinite(ot) || ot < 0 || ot > 24) {
    return { ok: false, error: "Overtime hours must be between 0 and 24." };
  }

  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("hr_employees")
    .select("id")
    .eq("id", input.employeeId)
    .eq("restaurant_id", ctx.restaurant.id)
    .maybeSingle();
  if (!emp) return { ok: false, error: "Employee not found." };

  const { error } = await admin.from("hr_attendance").upsert(
    {
      restaurant_id: ctx.restaurant.id,
      employee_id: emp.id,
      work_date: input.workDate,
      status: input.status as HrAttendanceStatus,
      check_in: checkIn,
      check_out: checkOut,
      overtime_hours: ot,
      note: input.note?.trim().slice(0, 200) || null,
    },
    { onConflict: "employee_id,work_date" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/hr`);
  return { ok: true };
}

export async function markBulkAttendanceAction(
  slug: string,
  input: {
    workDate: string;
    outletId?: string | null;
    status?: string;
  },
): Promise<Result<{ markedCount: number }>> {
  const ctx = await opsContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isValidIsoDate(input.workDate)) return { ok: false, error: "Invalid date." };

  const status = input.status ?? "present";
  if (!isInEnum(HR_ATTENDANCE_STATUSES, status)) {
    return { ok: false, error: "Invalid attendance status." };
  }

  const admin = createAdminClient();
  let empQuery = admin
    .from("hr_employees")
    .select("id")
    .eq("restaurant_id", ctx.restaurant.id)
    .eq("status", "active");

  if (input.outletId && input.outletId !== "__all__") {
    if (!isUuid(input.outletId)) {
      return { ok: false, error: "Invalid outlet filter." };
    }
    empQuery = empQuery.eq("outlet_id", input.outletId);
  }

  const [{ data: employees, error: empErr }, { data: existingRows, error: attErr }] =
    await Promise.all([
      empQuery,
      admin
        .from("hr_attendance")
        .select("employee_id")
        .eq("restaurant_id", ctx.restaurant.id)
        .eq("work_date", input.workDate),
    ]);

  if (empErr || attErr) {
    return { ok: false, error: empErr?.message ?? attErr?.message ?? "Failed to mark." };
  }

  const alreadyMarked = new Set((existingRows ?? []).map((r) => r.employee_id));
  const toInsert = (employees ?? [])
    .filter((e) => !alreadyMarked.has(e.id))
    .map((e) => ({
      restaurant_id: ctx.restaurant.id,
      employee_id: e.id,
      work_date: input.workDate,
      status,
      overtime_hours: 0,
    }));

  if (toInsert.length > 0) {
    const { error: insertErr } = await admin.from("hr_attendance").insert(toInsert);
    if (insertErr) return { ok: false, error: insertErr.message };
  }

  revalidatePath(`/r/${slug}/admin/hr`);
  return { ok: true, markedCount: toInsert.length };
}

export async function recordAdvanceAction(
  slug: string,
  input: {
    employeeId: string;
    advanceDate: string;
    amount: number;
    paymentMode: string;
    note?: string | null;
  },
): Promise<Result> {
  const ctx = await opsContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(input.employeeId)) return { ok: false, error: "Select a staff member." };
  if (!isValidIsoDate(input.advanceDate)) return { ok: false, error: "Invalid advance date." };
  if (!isInEnum(HR_PAYMENT_MODES, input.paymentMode)) {
    return { ok: false, error: "Choose a valid payment mode." };
  }

  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    return { ok: false, error: "Enter a positive advance amount." };
  }

  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("hr_employees")
    .select("id")
    .eq("id", input.employeeId)
    .eq("restaurant_id", ctx.restaurant.id)
    .maybeSingle();
  if (!emp) return { ok: false, error: "Employee not found." };

  const { error } = await admin.from("hr_advances").insert({
    restaurant_id: ctx.restaurant.id,
    employee_id: emp.id,
    advance_date: input.advanceDate,
    amount,
    payment_mode: input.paymentMode as HrPaymentMode,
    note: input.note?.trim().slice(0, 200) || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/hr`);
  return { ok: true };
}

export async function deleteAdvanceAction(
  slug: string,
  advanceId: string,
): Promise<Result> {
  const ctx = await opsContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(advanceId)) return { ok: false, error: "Advance not found." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("hr_advances")
    .select("id, deducted_payroll_month")
    .eq("id", advanceId)
    .eq("restaurant_id", ctx.restaurant.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Advance record not found." };
  if (row.deducted_payroll_month) {
    return {
      ok: false,
      error: `Cannot delete an advance already settled in ${row.deducted_payroll_month} payroll.`,
    };
  }

  const { error } = await admin
    .from("hr_advances")
    .delete()
    .eq("id", row.id)
    .eq("restaurant_id", ctx.restaurant.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/hr`);
  return { ok: true };
}

export async function generateMonthlyPayrollAction(
  slug: string,
  payrollMonth: string,
): Promise<Result<{ generatedCount: number; skippedPaidCount: number }>> {
  const ctx = await opsContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  const month = payrollMonth.trim();
  if (!isValidYearMonth(month)) {
    return { ok: false, error: "Choose a valid month (YYYY-MM)." };
  }

  const days = daysInYearMonth(month);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(days).padStart(2, "0")}`;

  const admin = createAdminClient();
  const [
    { data: employees, error: empErr },
    { data: attendanceRows, error: attErr },
    { data: advanceRows, error: advErr },
    { data: existingRows, error: payErr },
  ] = await Promise.all([
    admin
      .from("hr_employees")
      .select("id, pay_type, base_pay, status")
      .eq("restaurant_id", ctx.restaurant.id)
      .in("status", ["active", "on_leave"]),
    admin
      .from("hr_attendance")
      .select("employee_id, status, overtime_hours")
      .eq("restaurant_id", ctx.restaurant.id)
      .gte("work_date", monthStart)
      .lte("work_date", monthEnd),
    admin
      .from("hr_advances")
      .select("employee_id, amount")
      .eq("restaurant_id", ctx.restaurant.id)
      .is("deducted_payroll_month", null)
      .lte("advance_date", monthEnd),
    admin
      .from("hr_payroll_entries")
      .select("id, employee_id, payment_status, bonus_amount, other_deduction, note")
      .eq("restaurant_id", ctx.restaurant.id)
      .eq("payroll_month", month),
  ]);

  if (empErr || attErr || advErr || payErr) {
    return {
      ok: false,
      error:
        empErr?.message ??
        attErr?.message ??
        advErr?.message ??
        payErr?.message ??
        "Could not load payroll data.",
    };
  }

  const existingByEmp = new Map((existingRows ?? []).map((r) => [r.employee_id, r]));
  const countsByEmp = new Map<
    string,
    { counts: AttendanceCounts; overtimeHours: number }
  >();

  for (const att of attendanceRows ?? []) {
    const bucket = countsByEmp.get(att.employee_id) ?? {
      counts: { present: 0, halfDay: 0, absent: 0, paidLeave: 0, weeklyOff: 0 },
      overtimeHours: 0,
    };
    switch (att.status) {
      case "present":
        bucket.counts.present += 1;
        break;
      case "half_day":
        bucket.counts.halfDay += 1;
        break;
      case "absent":
        bucket.counts.absent += 1;
        break;
      case "paid_leave":
        bucket.counts.paidLeave += 1;
        break;
      case "weekly_off":
        bucket.counts.weeklyOff += 1;
        break;
    }
    bucket.overtimeHours += Number(att.overtime_hours ?? 0);
    countsByEmp.set(att.employee_id, bucket);
  }

  const advanceByEmp = new Map<string, number>();
  for (const adv of advanceRows ?? []) {
    advanceByEmp.set(
      adv.employee_id,
      round2((advanceByEmp.get(adv.employee_id) ?? 0) + Number(adv.amount ?? 0)),
    );
  }

  let skippedPaidCount = 0;
  const upserts = [];

  for (const emp of employees ?? []) {
    const existing = existingByEmp.get(emp.id);
    if (existing?.payment_status === "paid") {
      skippedPaidCount += 1;
      continue;
    }

    const att = countsByEmp.get(emp.id) ?? {
      counts: { present: 0, halfDay: 0, absent: 0, paidLeave: 0, weeklyOff: 0 },
      overtimeHours: 0,
    };
    const bonusAmount = Number(existing?.bonus_amount ?? 0);
    const otherDeduction = Number(existing?.other_deduction ?? 0);
    const advanceDeduction = advanceByEmp.get(emp.id) ?? 0;

    const computed = computeEmployeePayroll({
      payType: emp.pay_type === "daily" ? "daily" : "monthly",
      basePay: Number(emp.base_pay ?? 0),
      daysInMonth: days,
      counts: att.counts,
      overtimeHours: att.overtimeHours,
      bonusAmount,
      advanceDeduction,
      otherDeduction,
    });

    upserts.push({
      restaurant_id: ctx.restaurant.id,
      employee_id: emp.id,
      payroll_month: month,
      days_in_month: days,
      payable_days: computed.payableDays,
      overtime_hours: computed.overtimeHours,
      gross_earned: computed.grossEarned,
      overtime_pay: computed.overtimePay,
      bonus_amount: computed.bonusAmount,
      advance_deduction: computed.advanceDeduction,
      other_deduction: computed.otherDeduction,
      net_payable: computed.netPayable,
      payment_status: "pending",
      note: existing?.note ?? null,
    });
  }

  if (upserts.length > 0) {
    const { error: upsertErr } = await admin
      .from("hr_payroll_entries")
      .upsert(upserts, { onConflict: "employee_id,payroll_month" });
    if (upsertErr) return { ok: false, error: upsertErr.message };
  }

  revalidatePath(`/r/${slug}/admin/hr`);
  return { ok: true, generatedCount: upserts.length, skippedPaidCount };
}

export async function updatePayrollAdjustmentsAction(
  slug: string,
  input: {
    payrollId: string;
    bonusAmount: number;
    otherDeduction: number;
    note?: string | null;
  },
): Promise<Result> {
  const ctx = await opsContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(input.payrollId)) return { ok: false, error: "Payroll entry not found." };

  const bonusAmount = round2(Number(input.bonusAmount));
  const otherDeduction = round2(Number(input.otherDeduction));
  if (
    !Number.isFinite(bonusAmount) ||
    bonusAmount < 0 ||
    !Number.isFinite(otherDeduction) ||
    otherDeduction < 0
  ) {
    return { ok: false, error: "Bonus and deductions must be ₹0 or greater." };
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("hr_payroll_entries")
    .select("*")
    .eq("id", input.payrollId)
    .eq("restaurant_id", ctx.restaurant.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Payroll entry not found." };
  if (row.payment_status === "paid") {
    return { ok: false, error: "Paid salary slips cannot be edited." };
  }

  const netPayable = Math.max(
    0,
    round2(
      Number(row.gross_earned ?? 0) +
        Number(row.overtime_pay ?? 0) +
        bonusAmount -
        Number(row.advance_deduction ?? 0) -
        otherDeduction,
    ),
  );

  const { error } = await admin
    .from("hr_payroll_entries")
    .update({
      bonus_amount: bonusAmount,
      other_deduction: otherDeduction,
      net_payable: netPayable,
      note: input.note?.trim().slice(0, 240) || null,
    })
    .eq("id", row.id)
    .eq("restaurant_id", ctx.restaurant.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/hr`);
  return { ok: true };
}

export async function markPayrollPaidAction(
  slug: string,
  input: {
    payrollId: string;
    paymentMode: string;
    note?: string | null;
  },
): Promise<Result> {
  const ctx = await opsContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(input.payrollId)) return { ok: false, error: "Payroll entry not found." };
  if (!isInEnum(HR_PAYMENT_MODES, input.paymentMode)) {
    return { ok: false, error: "Choose a valid payout mode." };
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("hr_payroll_entries")
    .select("*")
    .eq("id", input.payrollId)
    .eq("restaurant_id", ctx.restaurant.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Payroll entry not found." };
  if (row.payment_status === "paid") {
    return { ok: false, error: "This salary slip is already marked paid." };
  }

  const days = daysInYearMonth(row.payroll_month);
  const monthEnd = `${row.payroll_month}-${String(days).padStart(2, "0")}`;

  const { error: updErr } = await admin
    .from("hr_payroll_entries")
    .update({
      payment_status: "paid",
      payment_mode: input.paymentMode as HrPaymentMode,
      paid_at: new Date().toISOString(),
      note: input.note?.trim().slice(0, 240) || row.note,
    })
    .eq("id", row.id)
    .eq("restaurant_id", ctx.restaurant.id);
  if (updErr) return { ok: false, error: updErr.message };

  // Tag unsettled advances for this employee up through the payroll month
  await admin
    .from("hr_advances")
    .update({ deducted_payroll_month: row.payroll_month })
    .eq("restaurant_id", ctx.restaurant.id)
    .eq("employee_id", row.employee_id)
    .is("deducted_payroll_month", null)
    .lte("advance_date", monthEnd);

  revalidatePath(`/r/${slug}/admin/hr`);
  return { ok: true };
}
