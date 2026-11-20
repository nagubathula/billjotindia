"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  Calculator,
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  History,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Smartphone,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/accounts";
import { DENOMINATIONS, type RegisterOrdersSummary } from "@/lib/register";
import type { OutletExpense, RegisterShift } from "@/lib/types";
import {
  createOutletExpenseAction,
  deleteOutletExpenseAction,
} from "../accounts/actions";
import {
  closeRegisterShiftAction,
  reopenRegisterShiftAction,
  saveShiftFloatAction,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type OutletShiftSummary = RegisterOrdersSummary & {
  outletId: string;
  outletName: string;
  gstin: string | null;
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const inrExact = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function buildAutoDenominations(expectedCash: number): Record<number, number> {
  let rem = Math.max(0, Math.round(expectedCash));
  const init: Record<number, number> = {
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
  };
  for (const d of DENOMINATIONS) {
    init[d] = Math.floor(rem / d);
    rem = rem % d;
  }
  return init;
}

function hydrateDenominations(
  shift: RegisterShift | undefined,
  fallbackExpected: number,
): Record<number, number> {
  if (
    shift?.denominations &&
    typeof shift.denominations === "object" &&
    !Array.isArray(shift.denominations)
  ) {
    const raw = shift.denominations as Record<string, unknown>;
    const anyNonZero = DENOMINATIONS.some((d) => Number(raw[String(d)] ?? 0) > 0);
    if (anyNonZero) {
      const out: Record<number, number> = {};
      for (const d of DENOMINATIONS) {
        out[d] = Math.max(0, Math.floor(Number(raw[String(d)] ?? 0) || 0));
      }
      return out;
    }
  }
  return buildAutoDenominations(fallbackExpected);
}

export function RegisterWorkbench({
  summaries,
  initialExpenses,
  initialShifts,
  todayDate,
  dateLabel,
  restaurantSlug,
}: {
  summaries: OutletShiftSummary[];
  initialExpenses: OutletExpense[];
  initialShifts: RegisterShift[];
  todayDate: string;
  dateLabel: string;
  restaurantSlug: string;
}) {
  const router = useRouter();
  const [selectedOutletId, setSelectedOutletId] = useState<string>(
    summaries[0]?.outletId ?? "",
  );
  const active =
    summaries.find((s) => s.outletId === selectedOutletId) ?? summaries[0];

  const [shifts, setShifts] = useState<RegisterShift[]>(initialShifts);
  const activeTodayShift = useMemo(
    () =>
      shifts.find(
        (sh) => sh.outlet_id === selectedOutletId && sh.shift_date === todayDate,
      ),
    [shifts, selectedOutletId, todayDate],
  );

  const [expenses, setExpenses] = useState<OutletExpense[]>(initialExpenses);
  const [newReason, setNewReason] = useState("");
  const [newCategory, setNewCategory] = useState<ExpenseCategory>("supplies");
  const [newAmount, setNewAmount] = useState("");
  const [expError, setExpError] = useState<string | null>(null);
  const [expPending, startExpTransition] = useTransition();

  const [shiftPending, startShiftTransition] = useTransition();
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [shiftMsg, setShiftMsg] = useState<string | null>(null);

  const outletExpenses = useMemo(
    () =>
      expenses.filter(
        (e) => e.outlet_id === null || e.outlet_id === selectedOutletId,
      ),
    [expenses, selectedOutletId],
  );

  const totalExpenses = useMemo(
    () =>
      outletExpenses
        .filter((e) => e.payment_mode === "cash")
        .reduce((s, e) => s + Number(e.amount ?? 0), 0),
    [outletExpenses],
  );
  const allExpensesTotal = useMemo(
    () => outletExpenses.reduce((s, e) => s + Number(e.amount ?? 0), 0),
    [outletExpenses],
  );

  const [openingFloat, setOpeningFloat] = useState<number>(() =>
    activeTodayShift ? Number(activeTodayShift.opening_float ?? 5000) : 5000,
  );

  const expectedDrawerCash = Math.max(
    0,
    Math.round(openingFloat + (active?.cashSales ?? 0) - totalExpenses),
  );

  const [notes, setNotes] = useState<Record<number, number>>(() =>
    hydrateDenominations(activeTodayShift, expectedDrawerCash),
  );
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [varianceNote, setVarianceNote] = useState(
    activeTodayShift?.variance_note ?? "",
  );

  function selectOutlet(outletId: string) {
    setSelectedOutletId(outletId);
    setShiftError(null);
    setShiftMsg(null);
    const sSummary = summaries.find((s) => s.outletId === outletId);
    const sh = shifts.find(
      (x) => x.outlet_id === outletId && x.shift_date === todayDate,
    );
    const nextFloat = sh ? Number(sh.opening_float ?? 5000) : 5000;
    const cashExp = expenses
      .filter(
        (e) =>
          e.payment_mode === "cash" &&
          (e.outlet_id === null || e.outlet_id === outletId),
      )
      .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
    const nextExp = Math.max(
      0,
      Math.round(nextFloat + (sSummary?.cashSales ?? 0) - cashExp),
    );
    setOpeningFloat(nextFloat);
    setNotes(hydrateDenominations(sh, nextExp));
    setVarianceNote(sh?.variance_note ?? "");
  }

  const countedCash = useMemo(
    () => DENOMINATIONS.reduce((s, d) => s + d * (notes[d] ?? 0), 0),
    [notes],
  );
  const variance = countedCash - expectedDrawerCash;
  const shiftClosed = activeTodayShift?.status === "closed";

  function upsertLocalShift(saved: RegisterShift) {
    setShifts((prev) => {
      const rest = prev.filter((x) => x.id !== saved.id);
      return [saved, ...rest].sort((a, b) =>
        b.shift_date.localeCompare(a.shift_date),
      );
    });
  }

  function handleSaveFloat() {
    if (!active) return;
    setShiftError(null);
    setShiftMsg(null);
    startShiftTransition(async () => {
      const res = await saveShiftFloatAction(restaurantSlug, {
        outletId: active.outletId,
        shiftDate: todayDate,
        openingFloat,
      });
      if (!res.ok) {
        setShiftError(res.error);
        return;
      }
      upsertLocalShift(res.shift);
      setShiftMsg("Opening float saved to shift log.");
      router.refresh();
    });
  }

  function handleConfirmZClose(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setShiftError(null);
    setShiftMsg(null);
    const denomMap: Record<string, number> = {};
    for (const d of DENOMINATIONS) denomMap[String(d)] = notes[d] ?? 0;

    startShiftTransition(async () => {
      const res = await closeRegisterShiftAction(restaurantSlug, {
        outletId: active.outletId,
        shiftDate: todayDate,
        openingFloat,
        denominations: denomMap,
        varianceNote,
      });
      if (!res.ok) {
        setShiftError(res.error);
        return;
      }
      upsertLocalShift(res.shift);
      setCloseModalOpen(false);
      setShiftMsg("Day-End Z-Report closed & audited.");
      router.refresh();
    });
  }

  function handleReopenShift() {
    if (!activeTodayShift) return;
    setShiftError(null);
    setShiftMsg(null);
    startShiftTransition(async () => {
      const res = await reopenRegisterShiftAction(restaurantSlug, {
        shiftId: activeTodayShift.id,
      });
      if (!res.ok) {
        setShiftError(res.error);
        return;
      }
      upsertLocalShift(res.shift);
      setShiftMsg("Shift reopened for adjustments.");
      router.refresh();
    });
  }

  function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    const amt = Math.max(0, Number(newAmount) || 0);
    if (!newReason.trim() || amt <= 0) return;
    setExpError(null);
    startExpTransition(async () => {
      const res = await createOutletExpenseAction(restaurantSlug, {
        outlet_id: selectedOutletId || null,
        expense_date: todayDate,
        category: newCategory,
        title: newReason.trim(),
        amount: amt,
        payment_mode: "cash",
      });
      if (!res.ok) {
        setExpError(res.error);
        return;
      }
      setExpenses((prev) => [res.expense, ...prev]);
      setNewReason("");
      setNewAmount("");
      router.refresh();
    });
  }

  function handleRemoveExpense(id: string) {
    setExpError(null);
    startExpTransition(async () => {
      const res = await deleteOutletExpenseAction(restaurantSlug, id);
      if (!res.ok) {
        setExpError(res.error);
        return;
      }
      setExpenses((prev) => prev.filter((x) => x.id !== id));
      router.refresh();
    });
  }

  function matchExpectedDenominations() {
    setNotes(buildAutoDenominations(expectedDrawerCash));
  }

  const outletNameById = useMemo(
    () => new Map(summaries.map((s) => [s.outletId, s.outletName])),
    [summaries],
  );

  function exportShiftsCsv() {
    const header = [
      "Date",
      "Outlet",
      "Status",
      "Opening Float",
      "Cash Sales",
      "UPI Sales",
      "Card Sales",
      "Khata Tabs",
      "Petty Cash",
      "Expected Cash",
      "Counted Cash",
      "Variance",
      "Closed By",
      "Variance Note",
    ];
    const rows = shifts.map((s) =>
      [
        s.shift_date,
        outletNameById.get(s.outlet_id) ?? s.outlet_id,
        s.status,
        s.opening_float,
        s.cash_sales,
        s.upi_sales,
        s.card_sales,
        s.tab_sales,
        s.petty_cash_expenses,
        s.expected_cash,
        s.counted_cash ?? "",
        s.variance ?? "",
        s.closed_by ?? "",
        s.variance_note ?? "",
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${restaurantSlug}-register-shifts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!active) {
    return (
      <p className="text-sm text-muted-foreground">No outlets configured.</p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Outlet Switcher & Print/Close buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          {summaries.map((s) => (
            <button
              key={s.outletId}
              type="button"
              onClick={() => selectOutlet(s.outletId)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                selectedOutletId === s.outletId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {s.outletName}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print Thermal Z-Report
          </Button>
          {shiftClosed ? (
            <Button
              variant="outline"
              size="sm"
              disabled={shiftPending}
              onClick={handleReopenShift}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reopen Closed Shift
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={shiftPending}
              onClick={() => {
                setShiftError(null);
                setCloseModalOpen(true);
              }}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Close Day-End Register
            </Button>
          )}
        </div>
      </div>

      {shiftError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-2 text-xs text-destructive print:hidden">
          {shiftError}
        </div>
      )}
      {shiftMsg && (
        <div className="rounded-lg bg-emerald-500/10 px-4 py-2 text-xs text-emerald-800 print:hidden">
          {shiftMsg}
        </div>
      )}

      {shiftClosed && activeTodayShift && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-800 print:hidden">
          <span>
            ✓ Day-End Z-Report closed for {active.outletName} ({dateLabel}). Counted cash{" "}
            {inr(Number(activeTodayShift.counted_cash ?? countedCash))} (Variance{" "}
            {Number(activeTodayShift.variance ?? 0) >= 0
              ? `+${inr(Number(activeTodayShift.variance ?? 0))}`
              : inr(Number(activeTodayShift.variance ?? 0))}
            ){activeTodayShift.closed_by ? ` · Verified by ${activeTodayShift.closed_by}` : ""}.
          </span>
          <Badge className="bg-emerald-600 text-white">Audited &amp; Closed</Badge>
        </div>
      )}

      {/* Open / Unsettled Tables Banner */}
      {active.openTablesCount > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5 print:hidden">
          <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>
                  {active.openTablesCount}{" "}
                  {active.openTablesCount === 1
                    ? "open table is"
                    : "open tables are"}{" "}
                  still unsettled ({inrExact(active.openTablesAmount)})
                </span>
              </div>
              <p className="text-xs text-amber-800/90">
                Open running KOT tables are excluded from drawer cash and settled sales until collected at the POS counter.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {active.openTables.map((ot) => {
                  const tableCode = ot.label.split("·")[0].trim();
                  return (
                    <Link
                      key={ot.id}
                      href={`/r/${restaurantSlug}/pos?table=${encodeURIComponent(tableCode)}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-card px-2 py-0.5 text-[11px] font-medium text-foreground transition hover:border-amber-600"
                    >
                      <span>{ot.label}</span>
                      {ot.tokenNumber != null && (
                        <span className="text-muted-foreground">
                          #{ot.tokenNumber}
                        </span>
                      )}
                      <span className="font-semibold tabular-nums">
                        {inr(ot.amount)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <Link
              href={`/r/${restaurantSlug}/pos`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "shrink-0 border-amber-500/40 bg-card text-xs",
              )}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Settle in POS
            </Link>
          </CardContent>
        </Card>
      )}

      {/* KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Expected Drawer Cash</span>
              <Wallet className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {inr(expectedDrawerCash)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Float {inr(openingFloat)} + Cash {inr(active.cashSales)} − Petty{" "}
              {inr(totalExpenses)}
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Digital Tenders (UPI + Card)</span>
              <Smartphone className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {inr(active.upiSales + active.cardSales + active.webSales)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              UPI {inr(active.upiSales)} · Card {inr(active.cardSales)} · Web{" "}
              {inr(active.webSales)}
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Aggregator Net Receivable</span>
              <CreditCard className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {inr(active.aggregatorNet)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              From {inr(active.aggregatorGross)} Zomato/Swiggy gross
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Petty Payouts &amp; Khata</span>
              <Banknote className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {inr(totalExpenses)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {outletExpenses.length} vouchers ({inr(allExpensesTotal)} total) ·
              Tab/Khata {inr(active.tabSales)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Drawer Reconciliation + Denomination Counter + Thermal Z-Report Preview */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        {/* Column 1: Cash Drawer & Petty Cash Expenses */}
        <div className="space-y-4 print:hidden">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cash Drawer Equation</CardTitle>
              <CardDescription>
                Live cash reconciliation for {active.outletName}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Label
                  htmlFor="open-float"
                  className="text-xs font-normal text-muted-foreground"
                >
                  1. Opening Cash Float (Morning)
                </Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">₹</span>
                  <Input
                    id="open-float"
                    type="number"
                    disabled={shiftClosed}
                    value={openingFloat}
                    onChange={(e) =>
                      setOpeningFloat(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="h-7 w-24 text-right text-xs tabular-nums"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={shiftClosed || shiftPending}
                    onClick={handleSaveFloat}
                    title="Save float to DB"
                  >
                    <Save className="mr-1 h-3 w-3" />
                    Save
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  2. + Counter POS Cash Sales Today
                </span>
                <span className="font-medium text-emerald-700 tabular-nums">
                  +{inrExact(active.cashSales)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  3. − Petty Cash Payouts / Expenses
                </span>
                <span className="font-medium text-rose-600 tabular-nums">
                  −{inrExact(totalExpenses)}
                </span>
              </div>

              <Separator />

              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Expected Cash in Drawer</span>
                <span className="text-base tabular-nums">
                  {inr(expectedDrawerCash)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Petty Cash Ledger */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Petty Cash Payouts (Vouchers)
              </CardTitle>
              <CardDescription>
                Log cash paid out from the counter drawer for kitchen supplies or utilities.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form
                onSubmit={handleAddExpense}
                className="grid grid-cols-[minmax(0,1fr)_6rem_auto] gap-2"
              >
                <Input
                  placeholder="What was it for? e.g. Milk & curd"
                  aria-label="Expense reason"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="col-span-3 h-8 text-xs"
                  required
                />
                <Select
                  value={newCategory}
                  onValueChange={(v) => v && setNewCategory(v as ExpenseCategory)}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-8 w-full text-xs"
                    aria-label="Expense category"
                  >
                    <SelectValue>{EXPENSE_CATEGORY_LABEL[newCategory]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Amount"
                  aria-label="Amount"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="h-8 text-right text-xs tabular-nums"
                  required
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-8"
                  disabled={expPending}
                  aria-label="Add voucher"
                >
                  {expPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Add
                </Button>
              </form>

              {expError && (
                <p className="rounded bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                  {expError}
                </p>
              )}

              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {outletExpenses.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No petty cash payouts logged for today yet.
                  </div>
                ) : (
                  outletExpenses.map((exp) => (
                    <div
                      key={exp.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{exp.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {EXPENSE_CATEGORY_LABEL[exp.category as ExpenseCategory] ??
                            exp.category}{" "}
                          · {exp.payment_mode.toUpperCase()}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold text-rose-600 tabular-nums">
                          −₹{Number(exp.amount ?? 0)}
                        </span>
                        <button
                          type="button"
                          disabled={expPending}
                          onClick={() => handleRemoveExpense(exp.id)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Remove voucher"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Column 2: Physical Cash Denomination Counter */}
        <Card className="print:hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator className="h-4 w-4" />
                Physical Note Counter
              </CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={shiftClosed}
                onClick={matchExpectedDenominations}
              >
                Auto-fill Expected
              </Button>
            </div>
            <CardDescription>
              Enter note counts from the physical cash drawer to compute variance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {DENOMINATIONS.map((denom) => {
                const count = notes[denom] ?? 0;
                return (
                  <div
                    key={denom}
                    className="grid grid-cols-[3.5rem_0.75rem_minmax(0,5rem)_minmax(0,1fr)] items-center gap-2 rounded-xl bg-muted/60 px-3 py-1.5 text-xs"
                  >
                    <span className="font-semibold tabular-nums">₹{denom}</span>
                    <span className="text-muted-foreground">×</span>
                    <Input
                      type="number"
                      min={0}
                      disabled={shiftClosed}
                      value={count}
                      onChange={(e) =>
                        setNotes((prev) => ({
                          ...prev,
                          [denom]: Math.max(
                            0,
                            Math.floor(Number(e.target.value) || 0),
                          ),
                        }))
                      }
                      className="h-7 bg-card text-right text-xs tabular-nums"
                    />
                    <span className="text-right font-medium tabular-nums">
                      {inr(denom * count)}
                    </span>
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Physical Cash Counted
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {inr(countedCash)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Expected Drawer Cash
                </span>
                <span className="tabular-nums">{inr(expectedDrawerCash)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>Drawer Variance</span>
                <span
                  className={cn(
                    "tabular-nums",
                    Math.abs(variance) < 10
                      ? "text-emerald-700"
                      : variance < 0
                        ? "text-destructive"
                        : "text-amber-700",
                  )}
                >
                  {variance === 0
                    ? "₹0 (Exact Match)"
                    : variance > 0
                      ? `+${inr(variance)} (Excess)`
                      : `${inr(variance)} (Shortage)`}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Column 3: 80mm Thermal Z-Report Slip Preview */}
        <div className="flex justify-center lg:col-span-2 xl:col-span-1">
          <article className="receipt-print w-[80mm] rounded-xl border border-border bg-white p-4 font-mono text-[11px] leading-snug text-black shadow-xs print:border-0 print:p-0 print:shadow-none">
            <header className="text-center">
              <div className="text-xs font-bold uppercase">
                DAY-END Z-REPORT
              </div>
              <div className="mt-0.5 font-bold uppercase">
                {active.outletName}
              </div>
              {active.gstin && (
                <div className="text-[10px]">GSTIN: {active.gstin}</div>
              )}
              <div className="text-[10px]">{dateLabel}</div>
            </header>

            <hr className="my-2 border-dashed border-black" />

            <div className="space-y-0.5">
              <ZRow label="Settled Bills" value={String(active.totalOrders)} />
              {active.openTablesCount > 0 && (
                <ZRow
                  label="Open Tables (Unsettled)"
                  value={`${active.openTablesCount} (${inrExact(active.openTablesAmount)})`}
                />
              )}
              <ZRow
                label="Cancelled Bills"
                value={String(active.cancelledOrders)}
              />
              <ZRow
                label="Settled Gross Sales"
                value={inrExact(active.grossSales)}
                bold
              />
              <ZRow label="Discounts Given" value={inrExact(active.discounts)} />
              <ZRow label="CGST (2.5%)" value={inrExact(active.cgst)} />
              <ZRow label="SGST (2.5%)" value={inrExact(active.sgst)} />
            </div>

            <hr className="my-2 border-dashed border-black" />
            <div className="mb-1 font-bold uppercase">TENDER BREAKDOWN</div>
            <div className="space-y-0.5">
              <ZRow label="Counter Cash" value={inrExact(active.cashSales)} />
              <ZRow label="Counter UPI" value={inrExact(active.upiSales)} />
              <ZRow label="Counter Card" value={inrExact(active.cardSales)} />
              <ZRow label="Customer Tab (Khata)" value={inrExact(active.tabSales)} />
              <ZRow label="Direct Storefront" value={inrExact(active.webSales)} />
              <ZRow
                label="Zomato / Swiggy"
                value={inrExact(active.aggregatorGross)}
              />
            </div>

            <hr className="my-2 border-dashed border-black" />
            <div className="mb-1 font-bold uppercase">CASH DRAWER AUDIT</div>
            <div className="space-y-0.5">
              <ZRow label="Opening Float" value={inr(openingFloat)} />
              <ZRow label="+ Cash Sales" value={inr(active.cashSales)} />
              <ZRow label="- Petty Payouts" value={inr(totalExpenses)} />
              <ZRow label="Expected Cash" value={inr(expectedDrawerCash)} bold />
              <ZRow label="Counted Cash" value={inr(countedCash)} bold />
              <ZRow
                label="Variance"
                value={variance >= 0 ? `+${inr(variance)}` : inr(variance)}
              />
            </div>

            <hr className="my-2 border-dashed border-black" />
            <div className="mt-4 flex justify-between pt-2 text-[10px]">
              <span>Cashier Sign</span>
              <span>Manager Sign</span>
            </div>
          </article>
        </div>
      </div>

      {/* Audited Past Register Shifts */}
      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" />
              Shift Audit Log
            </CardTitle>
            <CardDescription>
              Historical cash register closes and variance notes across outlets.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportShiftsCsv}
            disabled={shifts.length === 0}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shift Date</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead className="text-right">Float</TableHead>
                <TableHead className="text-right">Cash Sales</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Verified By</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-8 text-center text-xs text-muted-foreground"
                  >
                    No register shifts persisted yet. Save opening float or close day-end Z-Report above.
                  </TableCell>
                </TableRow>
              ) : (
                shifts.map((sh) => {
                  const v = Number(sh.variance ?? 0);
                  return (
                    <TableRow key={sh.id}>
                      <TableCell className="font-mono text-xs">
                        {sh.shift_date}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {outletNameById.get(sh.outlet_id) ?? "Outlet"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {inr(Number(sh.opening_float ?? 0))}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {inr(Number(sh.cash_sales ?? 0))}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {inr(Number(sh.expected_cash ?? 0))}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium tabular-nums">
                        {sh.counted_cash != null
                          ? inr(Number(sh.counted_cash))
                          : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-xs font-semibold tabular-nums",
                          sh.variance == null
                            ? "text-muted-foreground"
                            : Math.abs(v) < 10
                              ? "text-emerald-700"
                              : v < 0
                                ? "text-destructive"
                                : "text-amber-700",
                        )}
                      >
                        {sh.variance == null
                          ? "—"
                          : v >= 0
                            ? `+${inr(v)}`
                            : inr(v)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {sh.closed_by ?? sh.opened_by ?? "—"}
                        {sh.variance_note ? ` · ${sh.variance_note}` : ""}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={sh.status === "closed" ? "secondary" : "outline"}
                        >
                          {sh.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Audited Z-Close Confirmation Modal */}
      <Dialog open={closeModalOpen} onOpenChange={setCloseModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Close Day-End Z-Report · {active.outletName}
            </DialogTitle>
            <DialogDescription>
              Locks shift totals for {todayDate}. Expected drawer cash is{" "}
              {inr(expectedDrawerCash)}; counted cash is {inr(countedCash)}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmZClose} className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected Cash</span>
                <span className="font-medium tabular-nums">
                  {inr(expectedDrawerCash)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Counted Notes</span>
                <span className="font-semibold tabular-nums">
                  {inr(countedCash)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                <span>Variance</span>
                <span
                  className={cn(
                    "tabular-nums",
                    Math.abs(variance) >= 50 ? "text-amber-700" : "text-emerald-700",
                  )}
                >
                  {variance >= 0 ? `+${inr(variance)}` : inr(variance)}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="z-var-note" className="text-xs">
                Variance Note{" "}
                {Math.abs(variance) >= 50
                  ? "(Required for variance ≥ ₹50)"
                  : "(Optional)"}
              </Label>
              <Input
                id="z-var-note"
                value={varianceNote}
                required={Math.abs(variance) >= 50}
                onChange={(e) => setVarianceNote(e.target.value)}
                placeholder="e.g. Loose coin rounding or petty slip pending"
                className="h-8 text-xs"
              />
            </div>

            {shiftError && (
              <p className="rounded bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {shiftError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCloseModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={shiftPending}>
                {shiftPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Closing Shift…
                  </>
                ) : (
                  "Confirm & Lock Z-Report"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ZRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={cn("flex justify-between", bold && "font-bold")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
