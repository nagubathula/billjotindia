// Staff HR domain types, labels, and payroll computation helpers.

export const HR_DEPARTMENTS = [
  { value: "kitchen", label: "Kitchen" },
  { value: "service", label: "Service & Floor" },
  { value: "counter", label: "Counter & Billing" },
  { value: "delivery", label: "Delivery" },
  { value: "housekeeping", label: "Housekeeping & Utility" },
  { value: "management", label: "Management" },
] as const;

export type HrDepartment = (typeof HR_DEPARTMENTS)[number]["value"];

export const HR_DEPARTMENT_LABEL: Record<HrDepartment, string> = Object.fromEntries(
  HR_DEPARTMENTS.map((d) => [d.value, d.label]),
) as Record<HrDepartment, string>;

export const HR_EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-Time" },
  { value: "part_time", label: "Part-Time" },
  { value: "daily_wage", label: "Daily Wage" },
  { value: "contract", label: "Contract" },
] as const;

export type HrEmploymentType = (typeof HR_EMPLOYMENT_TYPES)[number]["value"];

export const HR_EMPLOYMENT_LABEL: Record<HrEmploymentType, string> = Object.fromEntries(
  HR_EMPLOYMENT_TYPES.map((e) => [e.value, e.label]),
) as Record<HrEmploymentType, string>;

export const HR_PAY_TYPES = [
  { value: "monthly", label: "Monthly Salary" },
  { value: "daily", label: "Daily Wage" },
] as const;

export type HrPayType = (typeof HR_PAY_TYPES)[number]["value"];

export const HR_ATTENDANCE_STATUSES = [
  { value: "present", label: "Present", shortLabel: "P" },
  { value: "half_day", label: "Half-Day", shortLabel: "HD" },
  { value: "absent", label: "Absent", shortLabel: "A" },
  { value: "paid_leave", label: "Paid Leave", shortLabel: "PL" },
  { value: "weekly_off", label: "Weekly Off", shortLabel: "WO" },
] as const;

export type HrAttendanceStatus = (typeof HR_ATTENDANCE_STATUSES)[number]["value"];

export const HR_ATTENDANCE_LABEL: Record<HrAttendanceStatus, string> =
  Object.fromEntries(
    HR_ATTENDANCE_STATUSES.map((s) => [s.value, s.label]),
  ) as Record<HrAttendanceStatus, string>;

export const HR_PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
] as const;

export type HrPaymentMode = (typeof HR_PAYMENT_MODES)[number]["value"];

export const HR_PAYMENT_MODE_LABEL: Record<HrPaymentMode, string> =
  Object.fromEntries(
    HR_PAYMENT_MODES.map((m) => [m.value, m.label]),
  ) as Record<HrPaymentMode, string>;

export const HR_EMPLOYEE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On Leave" },
  { value: "inactive", label: "Inactive" },
] as const;

export type HrEmployeeStatus = (typeof HR_EMPLOYEE_STATUSES)[number]["value"];

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/** Returns exact calendar days (28..31) for a 'YYYY-MM' string. */
export function daysInYearMonth(yearMonth: string): number {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(yearMonth.trim());
  if (!m) {
    throw new Error(`Invalid payroll month "${yearMonth}"; expected YYYY-MM`);
  }
  const year = Number(m[1]);
  const month = Number(m[2]); // 1..12
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidYearMonth(yearMonth: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth.trim());
}

export function isValidIsoDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return false;
  const [y, m, d] = dateStr.trim().split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export type AttendanceCounts = {
  present: number;
  halfDay: number;
  absent: number;
  paidLeave: number;
  weeklyOff: number;
};

export type ComputePayrollInput = {
  payType: HrPayType;
  basePay: number;
  daysInMonth: number;
  counts: AttendanceCounts;
  overtimeHours: number;
  bonusAmount?: number;
  advanceDeduction?: number;
  otherDeduction?: number;
};

export type ComputePayrollResult = {
  payableDays: number;
  overtimeHours: number;
  grossEarned: number;
  overtimePay: number;
  bonusAmount: number;
  advanceDeduction: number;
  otherDeduction: number;
  netPayable: number;
  assumedFullMonth: boolean;
};

export function computeEmployeePayroll(
  input: ComputePayrollInput,
): ComputePayrollResult {
  const basePay = Math.max(0, Number(input.basePay) || 0);
  const daysInMonth = Math.max(28, Math.min(31, Math.trunc(input.daysInMonth)));
  const present = Math.max(0, Number(input.counts.present) || 0);
  const halfDay = Math.max(0, Number(input.counts.halfDay) || 0);
  const absent = Math.max(0, Number(input.counts.absent) || 0);
  const paidLeave = Math.max(0, Number(input.counts.paidLeave) || 0);
  const weeklyOff = Math.max(0, Number(input.counts.weeklyOff) || 0);
  const overtimeHours = Math.max(0, round2(Number(input.overtimeHours) || 0));
  const bonusAmount = Math.max(0, round2(Number(input.bonusAmount) || 0));
  const advanceDeduction = Math.max(
    0,
    round2(Number(input.advanceDeduction) || 0),
  );
  const otherDeduction = Math.max(0, round2(Number(input.otherDeduction) || 0));

  const totalMarked = present + halfDay + absent + paidLeave + weeklyOff;

  let payableDays = 0;
  let assumedFullMonth = false;
  let grossEarned = 0;
  let overtimePay = 0;

  if (input.payType === "monthly") {
    if (totalMarked === 0) {
      payableDays = daysInMonth;
      assumedFullMonth = true;
    } else {
      payableDays = round2(present + paidLeave + weeklyOff + 0.5 * halfDay);
    }
    const dailyRate = basePay / daysInMonth;
    grossEarned = round2(dailyRate * payableDays);
    overtimePay = round2(overtimeHours * (dailyRate / 8));
  } else {
    payableDays = round2(present + paidLeave + 0.5 * halfDay);
    grossEarned = round2(basePay * payableDays);
    overtimePay = round2(overtimeHours * (basePay / 8));
  }

  const netPayable = Math.max(
    0,
    round2(
      grossEarned +
        overtimePay +
        bonusAmount -
        advanceDeduction -
        otherDeduction,
    ),
  );

  return {
    payableDays,
    overtimeHours,
    grossEarned,
    overtimePay,
    bonusAmount,
    advanceDeduction,
    otherDeduction,
    netPayable,
    assumedFullMonth,
  };
}
