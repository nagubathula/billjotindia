"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  Calculator,
  CheckCircle2,
  CreditCard,
  Plus,
  Printer,
  Receipt,
  Smartphone,
  Trash2,
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
import { cn } from "@/lib/utils";

export type OutletShiftSummary = {
  outletId: string;
  outletName: string;
  gstin: string | null;
  totalOrders: number;
  cancelledOrders: number;
  grossSales: number;
  cgst: number;
  sgst: number;
  discounts: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  webSales: number;
  aggregatorGross: number;
  aggregatorNet: number;
};

type PettyExpense = {
  id: string;
  reason: string;
  category: "Kitchen Supplies" | "Staff Welfare" | "Utilities & Gas" | "Misc";
  amount: number;
  time: string;
};

const INITIAL_EXPENSES: PettyExpense[] = [
  {
    id: "exp-1",
    reason: "Fresh curry leaves, mint & green chillies (morning market)",
    category: "Kitchen Supplies",
    amount: 320,
    time: "09:15 AM",
  },
  {
    id: "exp-2",
    reason: "Earthen clay pots for Kunda Perugu (20 pcs)",
    category: "Kitchen Supplies",
    amount: 400,
    time: "11:40 AM",
  },
  {
    id: "exp-3",
    reason: "Commercial LPG cylinder unloading & delivery tip",
    category: "Utilities & Gas",
    amount: 120,
    time: "02:10 PM",
  },
];

const DENOMINATIONS = [500, 200, 100, 50, 20, 10] as const;

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const inrExact = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function RegisterWorkbench({
  summaries,
  dateLabel,
}: {
  summaries: OutletShiftSummary[];
  dateLabel: string;
}) {
  const [selectedOutletId, setSelectedOutletId] = useState<string>(
    summaries[0]?.outletId ?? "",
  );
  const active =
    summaries.find((s) => s.outletId === selectedOutletId) ?? summaries[0];

  const [openingFloat, setOpeningFloat] = useState<number>(5000);
  const [expenses, setExpenses] = useState<PettyExpense[]>(INITIAL_EXPENSES);
  const [newReason, setNewReason] = useState("");
  const [newCategory, setNewCategory] =
    useState<PettyExpense["category"]>("Kitchen Supplies");
  const [newAmount, setNewAmount] = useState("");
  const [shiftClosed, setShiftClosed] = useState(false);

  // Denomination counts initialized near expected cash so it's realistic out-of-the-box
  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + e.amount, 0),
    [expenses],
  );
  const expectedDrawerCash = Math.max(
    0,
    Math.round(openingFloat + (active?.cashSales ?? 0) - totalExpenses),
  );

  const [notes, setNotes] = useState<Record<number, number>>(() => {
    let rem = Math.max(0, Math.round(5000 + (summaries[0]?.cashSales ?? 0) - 840));
    const init: Record<number, number> = { 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0 };
    for (const d of DENOMINATIONS) {
      init[d] = Math.floor(rem / d);
      rem = rem % d;
    }
    return init;
  });

  const countedCash = useMemo(() => {
    return DENOMINATIONS.reduce((s, d) => s + d * (notes[d] ?? 0), 0);
  }, [notes]);

  const variance = countedCash - expectedDrawerCash;

  function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    const amt = Math.max(0, Number(newAmount) || 0);
    if (!newReason.trim() || amt <= 0) return;
    setExpenses((prev) => [
      {
        id: `exp-${Date.now()}`,
        reason: newReason.trim(),
        category: newCategory,
        amount: amt,
        time: new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
      ...prev,
    ]);
    setNewReason("");
    setNewAmount("");
  }

  function matchExpectedDenominations() {
    let rem = expectedDrawerCash;
    const next: Record<number, number> = { 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0 };
    for (const d of DENOMINATIONS) {
      next[d] = Math.floor(rem / d);
      rem = rem % d;
    }
    setNotes(next);
  }

  if (!active) {
    return (
      <p className="text-sm text-muted-foreground">No outlets configured.</p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Outlet Switcher & Print Z-Report button */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          {summaries.map((s) => (
            <button
              key={s.outletId}
              type="button"
              onClick={() => setSelectedOutletId(s.outletId)}
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

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print Thermal Z-Report
          </Button>
          <Button
            size="sm"
            onClick={() => setShiftClosed((v) => !v)}
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            {shiftClosed ? "Shift Closed · Reopen" : "Close Day-End Register"}
          </Button>
        </div>
      </div>

      {shiftClosed && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-800 print:hidden">
          <span>
            ✓ Day-End Z-Report closed for {active.outletName} ({dateLabel}). Physical drawer cash verified at {inr(countedCash)}.
          </span>
          <Badge className="bg-emerald-600 text-white">Verified</Badge>
        </div>
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
              Float {inr(openingFloat)} + Cash {inr(active.cashSales)} − Petty {inr(totalExpenses)}
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
              UPI {inr(active.upiSales)} · Card {inr(active.cardSales)} · Web {inr(active.webSales)}
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
              <span>Petty Cash Payouts</span>
              <Banknote className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {inr(totalExpenses)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {expenses.length} drawer vouchers recorded today
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
              <div className="flex items-center justify-between">
                <Label htmlFor="open-float" className="text-xs font-normal text-muted-foreground">
                  1. Opening Cash Float (Morning)
                </Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">₹</span>
                  <Input
                    id="open-float"
                    type="number"
                    value={openingFloat}
                    onChange={(e) =>
                      setOpeningFloat(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="h-7 w-28 text-right text-xs tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  2. + Counter POS Cash Sales Today
                </span>
                <span className=" font-medium text-emerald-700 tabular-nums">
                  +{inrExact(active.cashSales)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  3. − Petty Cash Payouts / Expenses
                </span>
                <span className=" font-medium text-rose-600 tabular-nums">
                  −{inrExact(totalExpenses)}
                </span>
              </div>

              <Separator />

              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Expected Cash in Drawer</span>
                <span className=" text-base tabular-nums">
                  {inr(expectedDrawerCash)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Petty Cash Ledger */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Petty Cash Payouts (Vouchers)</CardTitle>
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
                  onValueChange={(v) => v && setNewCategory(v as PettyExpense["category"])}
                >
                  <SelectTrigger size="sm" className="h-8 w-full text-xs" aria-label="Expense category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kitchen Supplies">Kitchen Supplies</SelectItem>
                    <SelectItem value="Utilities & Gas">Utilities &amp; Gas</SelectItem>
                    <SelectItem value="Staff Welfare">Staff Welfare</SelectItem>
                    <SelectItem value="Misc">Misc</SelectItem>
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
                <Button type="submit" size="sm" className="h-8" aria-label="Add voucher">
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </form>

              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{exp.reason}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {exp.category} · {exp.time}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className=" font-semibold text-rose-600 tabular-nums">
                        −₹{exp.amount}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExpenses((prev) =>
                            prev.filter((x) => x.id !== exp.id),
                          )
                        }
                        className="text-muted-foreground hover:text-destructive"
                        title="Remove voucher"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
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
                    <span className="tabular-nums font-semibold">₹{denom}</span>
                    <span className="text-muted-foreground">×</span>
                    <Input
                      type="number"
                      min={0}
                      value={count}
                      onChange={(e) =>
                        setNotes((prev) => ({
                          ...prev,
                          [denom]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
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
                <span className="text-muted-foreground">Physical Cash Counted</span>
                <span className=" text-sm font-semibold tabular-nums">
                  {inr(countedCash)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected Drawer Cash</span>
                <span className=" tabular-nums">
                  {inr(expectedDrawerCash)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>Drawer Variance</span>
                <span
                  className={cn(
                    " tabular-nums",
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
          <article className="w-[80mm] rounded-xl border border-border bg-white p-4 font-mono text-[11px] leading-snug text-black shadow-xs print:border-0 print:p-0 print:shadow-none">
            <header className="text-center">
              <div className="text-xs font-bold uppercase">
                DAY-END Z-REPORT
              </div>
              <div className="mt-0.5 font-bold uppercase">{active.outletName}</div>
              {active.gstin && <div className="text-[10px]">GSTIN: {active.gstin}</div>}
              <div className="text-[10px]">{dateLabel}</div>
            </header>

            <hr className="my-2 border-dashed border-black" />

            <div className="space-y-0.5">
              <ZRow label="Completed Bills" value={String(active.totalOrders)} />
              <ZRow label="Cancelled Bills" value={String(active.cancelledOrders)} />
              <ZRow label="Gross Sales" value={inrExact(active.grossSales)} bold />
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
              <ZRow label="Direct Storefront" value={inrExact(active.webSales)} />
              <ZRow label="Zomato / Swiggy" value={inrExact(active.aggregatorGross)} />
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
