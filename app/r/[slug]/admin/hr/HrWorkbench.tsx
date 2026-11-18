"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  HR_ATTENDANCE_STATUSES,
  HR_DEPARTMENT_LABEL,
  HR_DEPARTMENTS,
  HR_EMPLOYEE_STATUSES,
  HR_EMPLOYMENT_LABEL,
  HR_EMPLOYMENT_TYPES,
  HR_PAY_TYPES,
  HR_PAYMENT_MODE_LABEL,
  HR_PAYMENT_MODES,
  type HrAttendanceStatus,
  type HrDepartment,
  type HrEmploymentType,
  type HrPaymentMode,
} from "@/lib/hr";
import type {
  AppRole,
  HrAdvance,
  HrAttendance,
  HrEmployee,
  HrPayrollEntry,
  Outlet,
} from "@/lib/types";
import {
  deleteAdvanceAction,
  deleteEmployeeAction,
  generateMonthlyPayrollAction,
  markAttendanceAction,
  markBulkAttendanceAction,
  markPayrollPaidAction,
  recordAdvanceAction,
  saveEmployeeAction,
  updatePayrollAdjustmentsAction,
} from "./actions";

type Props = {
  slug: string;
  role: AppRole;
  outlets: Outlet[];
  employees: HrEmployee[];
  selectedDate: string;
  selectedMonth: string;
  initialTab: string;
  attendanceOnDate: HrAttendance[];
  advances: HrAdvance[];
  payrollEntries: HrPayrollEntry[];
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function escapeCsv(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const ATTENDANCE_BTN_STYLE: Record<HrAttendanceStatus, string> = {
  present: "border-emerald-600 bg-emerald-600 text-white",
  half_day: "border-amber-500 bg-amber-500 text-white",
  absent: "border-red-600 bg-red-600 text-white",
  paid_leave: "border-sky-600 bg-sky-600 text-white",
  weekly_off: "border-slate-600 bg-slate-600 text-white",
};

export function HrWorkbench({
  slug,
  role,
  outlets,
  employees,
  selectedDate,
  selectedMonth,
  initialTab,
  attendanceOnDate,
  advances,
  payrollEntries,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState(initialTab);

  // Filters
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("__all__");
  const [outletFilter, setOutletFilter] = useState<string>("__all__");
  const [attOutletFilter, setAttOutletFilter] = useState<string>("__all__");

  // Add / Edit Employee dialog state
  const [empDialogOpen, setEmpDialogOpen] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [empCode, setEmpCode] = useState("");
  const [empName, setEmpName] = useState("");
  const [empDesignation, setEmpDesignation] = useState("");
  const [empDept, setEmpDept] = useState("kitchen");
  const [empType, setEmpType] = useState("full_time");
  const [empShift, setEmpShift] = useState("Morning (8 AM - 5 PM)");
  const [empPayType, setEmpPayType] = useState("monthly");
  const [empBasePay, setEmpBasePay] = useState("18000");
  const [empOutletId, setEmpOutletId] = useState("__all__");
  const [empPhone, setEmpPhone] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empUpi, setEmpUpi] = useState("");
  const [empGovtId, setEmpGovtId] = useState("");
  const [empJoinedOn, setEmpJoinedOn] = useState(selectedDate);
  const [empStatus, setEmpStatus] = useState("active");

  // Advance dialog state
  const [advDialogOpen, setAdvDialogOpen] = useState(false);
  const [advEmpId, setAdvEmpId] = useState("");
  const [advDate, setAdvDate] = useState(selectedDate);
  const [advAmount, setAdvAmount] = useState("");
  const [advMode, setAdvMode] = useState("cash");
  const [advNote, setAdvNote] = useState("");

  // Payroll adjust & payout dialogs
  const [adjustEntry, setAdjustEntry] = useState<HrPayrollEntry | null>(null);
  const [adjBonus, setAdjBonus] = useState("0");
  const [adjDeduction, setAdjDeduction] = useState("0");
  const [adjNote, setAdjNote] = useState("");

  const [payEntry, setPayEntry] = useState<HrPayrollEntry | null>(null);
  const [payMode, setPayMode] = useState("upi");
  const [payNote, setPayNote] = useState("");

  // Inline attendance drafts for check-in / check-out / overtime
  const [attDrafts, setAttDrafts] = useState<
    Record<string, { checkIn: string; checkOut: string; overtime: string }>
  >({});

  const outletNameById = useMemo(
    () => new Map(outlets.map((o) => [o.id, o.name])),
    [outlets],
  );
  const employeeById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );
  const attendanceByEmpId = useMemo(
    () => new Map(attendanceOnDate.map((a) => [a.employee_id, a])),
    [attendanceOnDate],
  );

  // KPIs
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === "active"),
    [employees],
  );
  const presentTodayCount = useMemo(
    () =>
      attendanceOnDate.filter(
        (a) => a.status === "present" || a.status === "half_day",
      ).length,
    [attendanceOnDate],
  );
  const unsettledAdvancesTotal = useMemo(
    () =>
      advances
        .filter((a) => !a.deducted_payroll_month)
        .reduce((s, a) => s + Number(a.amount ?? 0), 0),
    [advances],
  );
  const payrollTotals = useMemo(() => {
    let net = 0;
    let paidCount = 0;
    for (const p of payrollEntries) {
      net += Number(p.net_payable ?? 0);
      if (p.payment_status === "paid") paidCount += 1;
    }
    return {
      net,
      paidCount,
      pendingCount: Math.max(0, payrollEntries.length - paidCount),
    };
  }, [payrollEntries]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (deptFilter !== "__all__" && e.department !== deptFilter) return false;
      if (outletFilter !== "__all__" && e.outlet_id !== outletFilter) return false;
      if (!q) return true;
      return (
        e.full_name.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q) ||
        (e.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [employees, search, deptFilter, outletFilter]);

  const attendanceEmployees = useMemo(
    () =>
      employees.filter((e) => {
        if (e.status === "inactive") return false;
        if (attOutletFilter !== "__all__" && e.outlet_id !== attOutletFilter) {
          return false;
        }
        return true;
      }),
    [employees, attOutletFilter],
  );

  function pushQuery(nextDate: string, nextMonth: string, tab: string) {
    const params = new URLSearchParams();
    params.set("date", nextDate);
    params.set("month", nextMonth);
    params.set("tab", tab);
    router.push(`/r/${slug}/admin/hr?${params.toString()}`);
  }

  function openNewEmployeeDialog() {
    setEditingEmpId(null);
    setEmpCode("");
    setEmpName("");
    setEmpDesignation("");
    setEmpDept("kitchen");
    setEmpType("full_time");
    setEmpShift("Morning (8 AM - 5 PM)");
    setEmpPayType("monthly");
    setEmpBasePay("18000");
    setEmpOutletId(outlets[0]?.id ?? "__all__");
    setEmpPhone("");
    setEmpEmail("");
    setEmpUpi("");
    setEmpGovtId("");
    setEmpJoinedOn(selectedDate);
    setEmpStatus("active");
    setEmpDialogOpen(true);
  }

  function openEditEmployeeDialog(emp: HrEmployee) {
    setEditingEmpId(emp.id);
    setEmpCode(emp.employee_code);
    setEmpName(emp.full_name);
    setEmpDesignation(emp.designation);
    setEmpDept(emp.department);
    setEmpType(emp.employment_type);
    setEmpShift(emp.shift_name);
    setEmpPayType(emp.pay_type);
    setEmpBasePay(String(emp.base_pay));
    setEmpOutletId(emp.outlet_id ?? "__all__");
    setEmpPhone(emp.phone ?? "");
    setEmpEmail(emp.email ?? "");
    setEmpUpi(emp.upi_or_bank ?? "");
    setEmpGovtId(emp.govt_id_note ?? "");
    setEmpJoinedOn(emp.joined_on);
    setEmpStatus(emp.status);
    setEmpDialogOpen(true);
  }

  function handleSaveEmployee(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    startTransition(async () => {
      const res = await saveEmployeeAction(slug, {
        id: editingEmpId,
        employeeCode: empCode,
        fullName: empName,
        phone: empPhone,
        email: empEmail,
        department: empDept,
        designation: empDesignation,
        employmentType: empType,
        shiftName: empShift,
        payType: empPayType,
        basePay: Number(empBasePay),
        outletId: empOutletId,
        upiOrBank: empUpi,
        govtIdNote: empGovtId,
        joinedOn: empJoinedOn,
        status: empStatus,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setEmpDialogOpen(false);
      setBanner({
        kind: "ok",
        text: editingEmpId ? "Staff profile updated." : "Staff member added.",
      });
      router.refresh();
    });
  }

  function handleDeleteEmployee(emp: HrEmployee) {
    if (!confirm(`Delete "${emp.full_name}" (${emp.employee_code}) and all attendance/payroll records?`)) {
      return;
    }
    setBanner(null);
    startTransition(async () => {
      const res = await deleteEmployeeAction(slug, emp.id);
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setBanner({ kind: "ok", text: `Removed ${emp.full_name}.` });
      router.refresh();
    });
  }

  function handleMarkAttendance(emp: HrEmployee, nextStatus: HrAttendanceStatus) {
    const existing = attendanceByEmpId.get(emp.id);
    const draft = attDrafts[emp.id];
    const checkIn = draft?.checkIn ?? existing?.check_in?.slice(0, 5) ?? "";
    const checkOut = draft?.checkOut ?? existing?.check_out?.slice(0, 5) ?? "";
    const ot = draft?.overtime ?? String(existing?.overtime_hours ?? 0);

    setBanner(null);
    startTransition(async () => {
      const res = await markAttendanceAction(slug, {
        employeeId: emp.id,
        workDate: selectedDate,
        status: nextStatus,
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        overtimeHours: Number(ot) || 0,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      router.refresh();
    });
  }

  function handleBulkPresent() {
    setBanner(null);
    startTransition(async () => {
      const res = await markBulkAttendanceAction(slug, {
        workDate: selectedDate,
        outletId: attOutletFilter,
        status: "present",
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setBanner({
        kind: "ok",
        text:
          res.markedCount > 0
            ? `Marked ${res.markedCount} staff present on ${selectedDate}.`
            : "All active staff in this view already have attendance marked.",
      });
      router.refresh();
    });
  }

  function handleRecordAdvance(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    startTransition(async () => {
      const res = await recordAdvanceAction(slug, {
        employeeId: advEmpId,
        advanceDate: advDate,
        amount: Number(advAmount),
        paymentMode: advMode,
        note: advNote,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setAdvDialogOpen(false);
      setAdvAmount("");
      setAdvNote("");
      setBanner({ kind: "ok", text: "Salary advance recorded." });
      router.refresh();
    });
  }

  function handleDeleteAdvance(adv: HrAdvance) {
    if (!confirm("Delete this salary advance record?")) return;
    setBanner(null);
    startTransition(async () => {
      const res = await deleteAdvanceAction(slug, adv.id);
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setBanner({ kind: "ok", text: "Advance record deleted." });
      router.refresh();
    });
  }

  function handleGeneratePayroll() {
    setBanner(null);
    startTransition(async () => {
      const res = await generateMonthlyPayrollAction(slug, selectedMonth);
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setBanner({
        kind: "ok",
        text: `Generated ${res.generatedCount} payroll slip(s) for ${selectedMonth}${
          res.skippedPaidCount > 0
            ? ` (${res.skippedPaidCount} already-paid slips kept unchanged)`
            : ""
        }.`,
      });
      router.refresh();
    });
  }

  function handleSaveAdjustments(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustEntry) return;
    setBanner(null);
    startTransition(async () => {
      const res = await updatePayrollAdjustmentsAction(slug, {
        payrollId: adjustEntry.id,
        bonusAmount: Number(adjBonus),
        otherDeduction: Number(adjDeduction),
        note: adjNote,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setAdjustEntry(null);
      setBanner({ kind: "ok", text: "Payroll adjustments saved." });
      router.refresh();
    });
  }

  function handleMarkPayrollPaid(e: React.FormEvent) {
    e.preventDefault();
    if (!payEntry) return;
    setBanner(null);
    startTransition(async () => {
      const res = await markPayrollPaidAction(slug, {
        payrollId: payEntry.id,
        paymentMode: payMode,
        note: payNote,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setPayEntry(null);
      setBanner({ kind: "ok", text: "Salary marked paid and advances settled." });
      router.refresh();
    });
  }

  function exportPayrollCsv() {
    const header = [
      "Month",
      "Code",
      "Name",
      "Department",
      "Designation",
      "Pay Type",
      "Base Pay",
      "Payable Days",
      "Days In Month",
      "Overtime Hours",
      "Gross Earned",
      "Overtime Pay",
      "Bonus",
      "Advance Deduction",
      "Other Deduction",
      "Net Payable",
      "Status",
      "Mode",
    ].join(",");

    const lines = payrollEntries.map((row) => {
      const emp = employeeById.get(row.employee_id);
      return [
        escapeCsv(row.payroll_month),
        escapeCsv(emp?.employee_code),
        escapeCsv(emp?.full_name),
        escapeCsv(emp ? HR_DEPARTMENT_LABEL[emp.department as HrDepartment] ?? emp.department : ""),
        escapeCsv(emp?.designation),
        escapeCsv(emp?.pay_type),
        escapeCsv(emp?.base_pay),
        escapeCsv(row.payable_days),
        escapeCsv(row.days_in_month),
        escapeCsv(row.overtime_hours),
        escapeCsv(row.gross_earned),
        escapeCsv(row.overtime_pay),
        escapeCsv(row.bonus_amount),
        escapeCsv(row.advance_deduction),
        escapeCsv(row.other_deduction),
        escapeCsv(row.net_payable),
        escapeCsv(row.payment_status),
        escapeCsv(row.payment_mode),
      ].join(",");
    });

    const blob = new Blob([[header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billjot-payroll-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              Active Staff
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {activeEmployees.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {employees.length} total employee records
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
              Present ({selectedDate})
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {presentTodayCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {attendanceOnDate.length} of {activeEmployees.length} active marked
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-amber-600" />
              Unsettled Advances
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {inr(unsettledAdvancesTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Deducted automatically on next payroll
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5 text-primary" />
              Payroll ({selectedMonth})
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {inr(payrollTotals.net)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {payrollEntries.length === 0
              ? "Not generated yet"
              : `${payrollTotals.paidCount} paid · ${payrollTotals.pendingCount} pending`}
          </CardContent>
        </Card>
      </div>

      {banner && (
        <div
          role={banner.kind === "err" ? "alert" : "status"}
          className={cn(
            "rounded-xl border px-4 py-2.5 text-xs font-medium",
            banner.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {banner.text}
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(next) => {
          setActiveTab(next);
          setBanner(null);
        }}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="directory">Staff Directory</TabsTrigger>
          <TabsTrigger value="attendance">Daily Attendance</TabsTrigger>
          <TabsTrigger value="advances">Salary Advances</TabsTrigger>
          <TabsTrigger value="payroll">Monthly Payroll</TabsTrigger>
        </TabsList>

        {/* 1. STAFF DIRECTORY */}
        <TabsContent value="directory" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, code, phone…"
                  className="h-8 w-56 pl-8 text-xs"
                />
              </div>

              <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v ?? "__all__")}>
                <SelectTrigger size="sm" className="w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All departments</SelectItem>
                  {HR_DEPARTMENTS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {outlets.length > 1 && (
                <Select
                  value={outletFilter}
                  onValueChange={(v) => setOutletFilter(v ?? "__all__")}
                >
                  <SelectTrigger size="sm" className="w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All outlets</SelectItem>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button size="sm" onClick={openNewEmployeeDialog}>
              <Plus className="h-3.5 w-3.5" />
              Add Employee
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Department &amp; Shift</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Compensation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {emp.full_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{emp.employee_code}</span> ·{" "}
                          {emp.designation}
                          {emp.phone ? ` · ${emp.phone}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium">
                          {HR_DEPARTMENT_LABEL[emp.department as HrDepartment] ??
                            emp.department}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {HR_EMPLOYMENT_LABEL[
                            emp.employment_type as HrEmploymentType
                          ] ?? emp.employment_type}{" "}
                          · {emp.shift_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {emp.outlet_id
                          ? outletNameById.get(emp.outlet_id) ?? "—"
                          : "All Outlets"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <div className="font-semibold">
                          {inr(Number(emp.base_pay ?? 0))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {emp.pay_type === "daily" ? "per day" : "per month"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            emp.status === "active"
                              ? "default"
                              : emp.status === "on_leave"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {emp.status === "active"
                            ? "Active"
                            : emp.status === "on_leave"
                              ? "On Leave"
                              : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Edit ${emp.full_name}`}
                            onClick={() => openEditEmployeeDialog(emp)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {role === "admin" && (
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              aria-label={`Delete ${emp.full_name}`}
                              disabled={pending}
                              onClick={() => handleDeleteEmployee(emp)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-10 text-center text-xs text-muted-foreground"
                      >
                        No staff members match your filters. Click Add Employee to
                        build your roster.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. DAILY ATTENDANCE */}
        <TabsContent value="attendance" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      pushQuery(e.target.value, selectedMonth, "attendance");
                    }
                  }}
                  className="h-8 w-40 text-xs"
                />
              </div>

              {outlets.length > 1 && (
                <Select
                  value={attOutletFilter}
                  onValueChange={(v) => setAttOutletFilter(v ?? "__all__")}
                >
                  <SelectTrigger size="sm" className="w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All outlets</SelectItem>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button
              size="sm"
              disabled={pending || attendanceEmployees.length === 0}
              onClick={handleBulkPresent}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark All Unmarked Present
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Status ({selectedDate})</TableHead>
                    <TableHead className="w-28">Check-in</TableHead>
                    <TableHead className="w-28">Check-out</TableHead>
                    <TableHead className="w-24">OT (hrs)</TableHead>
                    <TableHead className="text-right">Save</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceEmployees.map((emp) => {
                    const row = attendanceByEmpId.get(emp.id);
                    const draft = attDrafts[emp.id];
                    const checkInVal =
                      draft?.checkIn ?? row?.check_in?.slice(0, 5) ?? "";
                    const checkOutVal =
                      draft?.checkOut ?? row?.check_out?.slice(0, 5) ?? "";
                    const otVal =
                      draft?.overtime ?? String(row?.overtime_hours ?? 0);

                    const updateDraft = (
                      patch: Partial<{ checkIn: string; checkOut: string; overtime: string }>,
                    ) =>
                      setAttDrafts((prev) => ({
                        ...prev,
                        [emp.id]: {
                          checkIn: checkInVal,
                          checkOut: checkOutVal,
                          overtime: otVal,
                          ...patch,
                        },
                      }));

                    return (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <div className="font-medium">{emp.full_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {emp.employee_code} · {emp.designation}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {HR_ATTENDANCE_STATUSES.map((st) => {
                              const active = row?.status === st.value;
                              return (
                                <button
                                  key={st.value}
                                  type="button"
                                  disabled={pending}
                                  onClick={() => handleMarkAttendance(emp, st.value)}
                                  className={cn(
                                    "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                                    active
                                      ? ATTENDANCE_BTN_STYLE[st.value]
                                      : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
                                  )}
                                >
                                  {st.label}
                                </button>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="time"
                            value={checkInVal}
                            onChange={(e) =>
                              updateDraft({ checkIn: e.target.value })
                            }
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="time"
                            value={checkOutVal}
                            onChange={(e) =>
                              updateDraft({ checkOut: e.target.value })
                            }
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={24}
                            step={0.5}
                            value={otVal}
                            onChange={(e) =>
                              updateDraft({ overtime: e.target.value })
                            }
                            className="h-8 text-xs tabular-nums"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              handleMarkAttendance(
                                emp,
                                (row?.status as HrAttendanceStatus) ?? "present",
                              )
                            }
                          >
                            Save
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {attendanceEmployees.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-10 text-center text-xs text-muted-foreground"
                      >
                        Add active employees in Staff Directory to track attendance.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. SALARY ADVANCES */}
        <TabsContent value="advances" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Advances stay open until the employee&apos;s monthly payroll slip is
              marked Paid, which automatically deducts and settles them.
            </p>
            <Button
              size="sm"
              disabled={activeEmployees.length === 0}
              onClick={() => {
                setAdvEmpId(activeEmployees[0]?.id ?? "");
                setAdvDate(selectedDate);
                setAdvDialogOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Record Advance
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Settlement</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {advances.map((adv) => {
                    const emp = employeeById.get(adv.employee_id);
                    return (
                      <TableRow key={adv.id}>
                        <TableCell className="text-xs tabular-nums">
                          {adv.advance_date}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {emp?.full_name ?? "Unknown"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {emp?.employee_code}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {HR_PAYMENT_MODE_LABEL[adv.payment_mode as HrPaymentMode] ??
                            adv.payment_mode}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {inr(Number(adv.amount ?? 0))}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                          {adv.note || "—"}
                        </TableCell>
                        <TableCell>
                          {adv.deducted_payroll_month ? (
                            <Badge variant="default">
                              Deducted ({adv.deducted_payroll_month})
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Open / Unsettled</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!adv.deducted_payroll_month && (
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              disabled={pending}
                              aria-label="Delete advance"
                              onClick={() => handleDeleteAdvance(adv)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {advances.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-10 text-center text-xs text-muted-foreground"
                      >
                        No salary advances recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. MONTHLY PAYROLL */}
        <TabsContent value="payroll" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  if (e.target.value) {
                    pushQuery(selectedDate, e.target.value, "payroll");
                  }
                }}
                className="h-8 w-44 text-xs"
              />
              <Button
                size="sm"
                disabled={pending || employees.length === 0}
                onClick={handleGeneratePayroll}
              >
                Generate / Refresh Payroll
              </Button>
            </div>

            <Button
              size="sm"
              variant="outline"
              disabled={payrollEntries.length === 0}
              onClick={exportPayrollCsv}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Payable Days</TableHead>
                    <TableHead className="text-right">Gross + OT</TableHead>
                    <TableHead className="text-right">Bonus</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Payable</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollEntries.map((row) => {
                    const emp = employeeById.get(row.employee_id);
                    const totalDed =
                      Number(row.advance_deduction ?? 0) +
                      Number(row.other_deduction ?? 0);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">
                            {emp?.full_name ?? "Staff Member"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {emp?.employee_code} ·{" "}
                            {emp?.pay_type === "daily" ? "Daily" : "Monthly"}{" "}
                            {emp ? inr(Number(emp.base_pay ?? 0)) : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          <div>
                            {Number(row.payable_days)} / {row.days_in_month} d
                          </div>
                          {Number(row.overtime_hours) > 0 && (
                            <div className="text-muted-foreground">
                              +{Number(row.overtime_hours)}h OT
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div>{inr(Number(row.gross_earned ?? 0))}</div>
                          {Number(row.overtime_pay ?? 0) > 0 && (
                            <div className="text-xs text-muted-foreground">
                              +{inr(Number(row.overtime_pay))} OT
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(row.bonus_amount ?? 0) > 0
                            ? inr(Number(row.bonus_amount))
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">
                          {totalDed > 0 ? `-${inr(totalDed)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {inr(Number(row.net_payable ?? 0))}
                        </TableCell>
                        <TableCell>
                          {row.payment_status === "paid" ? (
                            <Badge variant="default">
                              Paid (
                              {HR_PAYMENT_MODE_LABEL[
                                row.payment_mode as HrPaymentMode
                              ] ?? row.payment_mode}
                              )
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.payment_status === "pending" && (
                            <div className="inline-flex items-center gap-1.5">
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => {
                                  setAdjustEntry(row);
                                  setAdjBonus(String(row.bonus_amount ?? 0));
                                  setAdjDeduction(
                                    String(row.other_deduction ?? 0),
                                  );
                                  setAdjNote(row.note ?? "");
                                }}
                              >
                                Adjust
                              </Button>
                              <Button
                                size="xs"
                                onClick={() => {
                                  setPayEntry(row);
                                  setPayMode("upi");
                                  setPayNote(row.note ?? "");
                                }}
                              >
                                Mark Paid
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {payrollEntries.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-10 text-center text-xs text-muted-foreground"
                      >
                        Click Generate / Refresh Payroll to calculate {selectedMonth}{" "}
                        salaries from attendance and open advances.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ADD / EDIT EMPLOYEE DIALOG */}
      <Dialog open={empDialogOpen} onOpenChange={setEmpDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingEmpId ? "Edit Staff Member" : "Add Staff Member"}
            </DialogTitle>
            <DialogDescription>
              Keep HR profile, shift, attendance, and salary calculation details in
              one place.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEmployee} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="emp-name">Full Name *</Label>
                <Input
                  id="emp-name"
                  required
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  placeholder="Ramesh Kumar"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="emp-code">Employee Code</Label>
                <Input
                  id="emp-code"
                  value={empCode}
                  onChange={(e) => setEmpCode(e.target.value)}
                  placeholder="Auto (EMP-001)"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="emp-designation">Designation *</Label>
                <Input
                  id="emp-designation"
                  required
                  value={empDesignation}
                  onChange={(e) => setEmpDesignation(e.target.value)}
                  placeholder="Tandoor Chef / Captain"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Department</Label>
                <Select
                  value={empDept}
                  onValueChange={(v) => setEmpDept(v ?? "kitchen")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HR_DEPARTMENTS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Employment Type</Label>
                <Select
                  value={empType}
                  onValueChange={(v) => setEmpType(v ?? "full_time")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HR_EMPLOYMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Pay Basis</Label>
                <Select
                  value={empPayType}
                  onValueChange={(v) => setEmpPayType(v ?? "monthly")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HR_PAY_TYPES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="emp-pay">
                  {empPayType === "daily" ? "Daily Rate (₹) *" : "Monthly Salary (₹) *"}
                </Label>
                <Input
                  id="emp-pay"
                  type="number"
                  min={0}
                  step="1"
                  required
                  value={empBasePay}
                  onChange={(e) => setEmpBasePay(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Outlet</Label>
                <Select
                  value={empOutletId}
                  onValueChange={(v) => setEmpOutletId(v ?? "__all__")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All outlets</SelectItem>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="emp-shift">Shift</Label>
                <Input
                  id="emp-shift"
                  value={empShift}
                  onChange={(e) => setEmpShift(e.target.value)}
                  placeholder="Morning / Evening / Split"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="emp-joined">Joined On</Label>
                <Input
                  id="emp-joined"
                  type="date"
                  value={empJoinedOn}
                  onChange={(e) => setEmpJoinedOn(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select
                  value={empStatus}
                  onValueChange={(v) => setEmpStatus(v ?? "active")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HR_EMPLOYEE_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="emp-phone">Phone Number</Label>
                <Input
                  id="emp-phone"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                  placeholder="+91 98480 11223"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="emp-upi">UPI ID or Bank Account</Label>
                <Input
                  id="emp-upi"
                  value={empUpi}
                  onChange={(e) => setEmpUpi(e.target.value)}
                  placeholder="ramesh@okicici / HDFC ••••1234"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="emp-email">Email (optional)</Label>
                <Input
                  id="emp-email"
                  type="email"
                  value={empEmail}
                  onChange={(e) => setEmpEmail(e.target.value)}
                  placeholder="staff@restaurant.in"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="emp-idnote">ID / KYC Reference (optional)</Label>
                <Input
                  id="emp-idnote"
                  value={empGovtId}
                  onChange={(e) => setEmpGovtId(e.target.value)}
                  placeholder="Aadhaar last 4 / PAN verified"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEmpDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Saving…"
                  : editingEmpId
                    ? "Save Changes"
                    : "Create Employee"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* RECORD ADVANCE DIALOG */}
      <Dialog open={advDialogOpen} onOpenChange={setAdvDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Salary Advance</DialogTitle>
            <DialogDescription>
              Advances are automatically deducted from the next generated payroll
              slip.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordAdvance} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Staff Member *</Label>
              <Select
                value={advEmpId}
                onValueChange={(v) => setAdvEmpId(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose employee" />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="adv-amount">Amount (₹) *</Label>
                <Input
                  id="adv-amount"
                  type="number"
                  min={1}
                  required
                  value={advAmount}
                  onChange={(e) => setAdvAmount(e.target.value)}
                  placeholder="2000"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="adv-date">Date *</Label>
                <Input
                  id="adv-date"
                  type="date"
                  required
                  value={advDate}
                  onChange={(e) => setAdvDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Payment Mode</Label>
              <Select
                value={advMode}
                onValueChange={(v) => setAdvMode(v ?? "cash")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_PAYMENT_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="adv-note">Note (optional)</Label>
              <Input
                id="adv-note"
                value={advNote}
                onChange={(e) => setAdvNote(e.target.value)}
                placeholder="Reason or voucher number"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdvDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !advEmpId}>
                {pending ? "Saving…" : "Save Advance"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ADJUST PAYROLL DIALOG */}
      <Dialog
        open={Boolean(adjustEntry)}
        onOpenChange={(open) => !open && setAdjustEntry(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Salary Slip</DialogTitle>
            <DialogDescription>
              {adjustEntry
                ? `${employeeById.get(adjustEntry.employee_id)?.full_name ?? ""} · ${adjustEntry.payroll_month}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveAdjustments} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="adj-bonus">Bonus / Incentive (₹)</Label>
                <Input
                  id="adj-bonus"
                  type="number"
                  min={0}
                  value={adjBonus}
                  onChange={(e) => setAdjBonus(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="adj-ded">Other Deduction (₹)</Label>
                <Input
                  id="adj-ded"
                  type="number"
                  min={0}
                  value={adjDeduction}
                  onChange={(e) => setAdjDeduction(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="adj-note">Note</Label>
              <Input
                id="adj-note"
                value={adjNote}
                onChange={(e) => setAdjNote(e.target.value)}
                placeholder="Festival bonus / breakage recovery"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdjustEntry(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Update Slip"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MARK PAYROLL PAID DIALOG */}
      <Dialog
        open={Boolean(payEntry)}
        onOpenChange={(open) => !open && setPayEntry(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Salary Payout</DialogTitle>
            <DialogDescription>
              {payEntry
                ? `Pay ${inr(Number(payEntry.net_payable ?? 0))} to ${
                    employeeById.get(payEntry.employee_id)?.full_name ?? "staff"
                  }. Any open advances deducted on this slip will be marked settled.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMarkPayrollPaid} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Payout Mode</Label>
              <Select
                value={payMode}
                onValueChange={(v) => setPayMode(v ?? "upi")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_PAYMENT_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pay-note">Reference / Note (optional)</Label>
              <Input
                id="pay-note"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="UPI ref or cash voucher #"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPayEntry(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Processing…" : "Confirm Paid"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
