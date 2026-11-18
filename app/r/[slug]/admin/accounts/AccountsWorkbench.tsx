"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  Building2,
  CreditCard,
  Download,
  FileText,
  History,
  IndianRupee,
  Loader2,
  MessageCircle,
  Plus,
  Printer,
  Receipt,
  Search,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CORPORATE_PAYMENT_TERMS,
  CORPORATE_PAYMENT_TERMS_LABEL,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  INDIAN_STATES,
  TAB_PAYMENT_MODES,
  TAB_PAYMENT_MODE_LABEL,
  computeCorporateInvoiceTotals,
  type CorporateInvoiceLineInput,
  type CorporatePaymentTerms,
  type ExpenseCategory,
  type TabEntryType,
  type TabPaymentMode,
} from "@/lib/accounts";
import { DEFAULT_TIME_ZONE } from "@/lib/time";
import type {
  CorporateClient,
  CorporateInvoice,
  CustomerTab,
  CustomerTabTransaction,
  Outlet,
  OutletExpense,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  cancelCorporateInvoiceAction,
  createCorporateInvoiceAction,
  createOutletExpenseAction,
  deleteOutletExpenseAction,
  recordCorporateInvoicePaymentAction,
  recordTabTransactionAction,
  saveCorporateClientAction,
  saveCustomerTabAction,
  setCustomerTabStatusAction,
} from "./actions";

export type InvoiceSourceOrderRow = {
  id: string;
  outlet_id: string;
  unique_order_id: string | null;
  customer_name: string;
  customer_email: string;
  order_type: string | null;
  subtotal: number;
  cgst_amount: number;
  sgst_amount: number;
  total_amount: number;
  placed_at: string;
};

const inr = (n: number) =>
  `₹${Math.round(Number.isFinite(n) ? n : 0).toLocaleString("en-IN")}`;
const inrExact = (n: number) =>
  `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEFAULT_TIME_ZONE,
  });
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (val: string | number) => {
    const s = String(val ?? "");
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ].join("\n");
  const blob = new Blob([lines], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AccountsWorkbench({
  slug,
  restaurantName,
  todayDate,
  initialTab,
  outlets,
  initialTabs,
  initialTransactions,
  initialClients,
  initialInvoices,
  initialExpenses,
  recentOrders,
}: {
  slug: string;
  restaurantName: string;
  todayDate: string;
  initialTab: string;
  outlets: Outlet[];
  initialTabs: CustomerTab[];
  initialTransactions: CustomerTabTransaction[];
  initialClients: CorporateClient[];
  initialInvoices: CorporateInvoice[];
  initialExpenses: OutletExpense[];
  recentOrders: InvoiceSourceOrderRow[];
}) {
  const [tabs, setTabs] = useState<CustomerTab[]>(initialTabs);
  const [transactions, setTransactions] =
    useState<CustomerTabTransaction[]>(initialTransactions);
  const [clients, setClients] = useState<CorporateClient[]>(initialClients);
  const [invoices, setInvoices] = useState<CorporateInvoice[]>(initialInvoices);
  const [expenses, setExpenses] = useState<OutletExpense[]>(initialExpenses);

  const [tabSearch, setTabSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>("all");

  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  // ---- Tab Create / Edit Dialog ----
  const [tabModalOpen, setTabModalOpen] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tabName, setTabName] = useState("");
  const [tabPhone, setTabPhone] = useState("");
  const [tabEmail, setTabEmail] = useState("");
  const [tabOutletId, setTabOutletId] = useState<string>(outlets[0]?.id ?? "");
  const [tabLimit, setTabLimit] = useState("5000");
  const [tabNotes, setTabNotes] = useState("");

  // ---- Tab Entry (Charge / Settle / Credit Note) Dialog ----
  const [entryModalTab, setEntryModalTab] = useState<CustomerTab | null>(null);
  const [entryType, setEntryType] = useState<TabEntryType>("payment");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryMode, setEntryMode] = useState<TabPaymentMode>("upi");
  const [entryRef, setEntryRef] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [allowOverLimit, setAllowOverLimit] = useState(false);

  // ---- Tab Ledger History Dialog ----
  const [ledgerTab, setLedgerTab] = useState<CustomerTab | null>(null);

  // ---- Corporate Client Dialog ----
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientCompany, setClientCompany] = useState("");
  const [clientGstin, setClientGstin] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientStateCode, setClientStateCode] = useState("36");
  const [clientTerms, setClientTerms] = useState<CorporatePaymentTerms>("net_15");
  const [clientLimit, setClientLimit] = useState("50000");

  // ---- Corporate Invoice Builder Dialog ----
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invClientId, setInvClientId] = useState<string>(initialClients[0]?.id ?? "");
  const [invOutletId, setInvOutletId] = useState<string>(outlets[0]?.id ?? "");
  const [invNumber, setInvNumber] = useState("");
  const [invDate, setInvDate] = useState(todayDate);
  const [invPoRef, setInvPoRef] = useState("");
  const [invSupplyType, setInvSupplyType] = useState<"intra" | "inter">("intra");
  const [invNotes, setInvNotes] = useState("");
  const [invLines, setInvLines] = useState<CorporateInvoiceLineInput[]>([
    {
      description: "Corporate Team Lunch & Catering Services",
      hsn_sac: "996331",
      qty: 1,
      unit_price: 2500,
      gst_rate: 5,
    },
  ]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  // ---- Invoice Payment Dialog ----
  const [payInvoice, setPayInvoice] = useState<CorporateInvoice | null>(null);
  const [payInvoiceAmount, setPayInvoiceAmount] = useState("");

  // ---- Outlet Expense Dialog ----
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expOutletId, setExpOutletId] = useState<string>(outlets[0]?.id ?? "");
  const [expDate, setExpDate] = useState(todayDate);
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("supplies");
  const [expTitle, setExpTitle] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expMode, setExpMode] = useState<TabPaymentMode>("cash");
  const [expPaidTo, setExpPaidTo] = useState("");
  const [expNote, setExpNote] = useState("");

  // ---- KPIs ----
  const totalTabReceivable = tabs.reduce(
    (s, t) => s + Math.max(0, Number(t.current_balance ?? 0)),
    0,
  );
  const activeTabCount = tabs.filter((t) => t.status === "active").length;

  const issuedInvoices = invoices.filter((inv) => inv.status !== "cancelled");
  const totalCorpBilled = issuedInvoices.reduce(
    (s, inv) => s + Number(inv.total_amount ?? 0),
    0,
  );
  const totalCorpReceivable = issuedInvoices.reduce(
    (s, inv) =>
      s + Math.max(0, Number(inv.total_amount ?? 0) - Number(inv.amount_paid ?? 0)),
    0,
  );
  const unpaidInvoicesCount = issuedInvoices.filter(
    (inv) => inv.payment_status !== "paid",
  ).length;

  const todayExpensesTotal = expenses
    .filter((e) => e.expense_date === todayDate)
    .reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const totalExpensesLogged = expenses.reduce((s, e) => s + Number(e.amount ?? 0), 0);

  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );
  const outletById = useMemo(
    () => new Map(outlets.map((o) => [o.id, o])),
    [outlets],
  );

  const filteredTabs = useMemo(() => {
    const q = tabSearch.trim().toLowerCase();
    if (!q) return tabs;
    return tabs.filter(
      (t) =>
        t.customer_name.toLowerCase().includes(q) ||
        (t.phone ?? "").toLowerCase().includes(q) ||
        (t.company_or_notes ?? "").toLowerCase().includes(q),
    );
  }, [tabs, tabSearch]);

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((inv) => {
      const client = clientById.get(inv.corporate_client_id);
      return (
        inv.invoice_number.toLowerCase().includes(q) ||
        (inv.po_reference ?? "").toLowerCase().includes(q) ||
        (client?.company_name ?? "").toLowerCase().includes(q) ||
        (client?.gstin ?? "").toLowerCase().includes(q)
      );
    });
  }, [invoices, invoiceSearch, clientById]);

  const filteredExpenses = useMemo(() => {
    if (expenseCategoryFilter === "all") return expenses;
    return expenses.filter((e) => e.category === expenseCategoryFilter);
  }, [expenses, expenseCategoryFilter]);

  const previewInvoiceTotals = useMemo(
    () => computeCorporateInvoiceTotals(invLines, invSupplyType),
    [invLines, invSupplyType],
  );

  function openNewTabDialog() {
    setEditingTabId(null);
    setTabName("");
    setTabPhone("");
    setTabEmail("");
    setTabOutletId(outlets[0]?.id ?? "");
    setTabLimit("5000");
    setTabNotes("");
    setTabModalOpen(true);
  }

  function openEditTabDialog(t: CustomerTab) {
    setEditingTabId(t.id);
    setTabName(t.customer_name);
    setTabPhone(t.phone ?? "");
    setTabEmail(t.email ?? "");
    setTabOutletId(t.outlet_id ?? outlets[0]?.id ?? "");
    setTabLimit(String(Number(t.credit_limit ?? 5000)));
    setTabNotes(t.company_or_notes ?? "");
    setTabModalOpen(true);
  }

  function handleSaveTab(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    startTransition(async () => {
      const res = await saveCustomerTabAction(slug, {
        id: editingTabId ?? undefined,
        outlet_id: tabOutletId || null,
        customer_name: tabName,
        phone: tabPhone,
        email: tabEmail,
        company_or_notes: tabNotes,
        credit_limit: Number(tabLimit) || 0,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setTabs((prev) => {
        const exists = prev.some((x) => x.id === res.tab.id);
        return exists
          ? prev.map((x) => (x.id === res.tab.id ? res.tab : x))
          : [res.tab, ...prev];
      });
      setTabModalOpen(false);
      setBanner({
        kind: "ok",
        text: `${res.tab.customer_name}'s tab saved (Limit ${inr(Number(res.tab.credit_limit))}).`,
      });
    });
  }

  function openTabEntryDialog(tab: CustomerTab, kind: TabEntryType) {
    setEntryModalTab(tab);
    setEntryType(kind);
    const bal = Math.max(0, Number(tab.current_balance ?? 0));
    setEntryAmount(kind === "payment" && bal > 0 ? String(bal) : "");
    setEntryMode("upi");
    setEntryRef("");
    setEntryNote("");
    setAllowOverLimit(false);
  }

  function handleRecordTabEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!entryModalTab) return;
    setBanner(null);
    startTransition(async () => {
      const res = await recordTabTransactionAction(slug, {
        tab_id: entryModalTab.id,
        entry_type: entryType,
        amount: Number(entryAmount),
        payment_mode: entryType === "payment" ? entryMode : null,
        reference_no: entryRef,
        note: entryNote,
        allow_over_limit: allowOverLimit,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setTabs((prev) => prev.map((x) => (x.id === res.tab.id ? res.tab : x)));
      setTransactions((prev) => [res.transaction, ...prev]);
      setEntryModalTab(null);
      setBanner({
        kind: "ok",
        text: `Recorded ${entryType} of ${inrExact(Number(res.transaction.amount))} on ${res.tab.customer_name}'s tab. Balance: ${inrExact(Number(res.tab.current_balance))}.`,
      });
    });
  }

  function handleToggleTabStatus(tab: CustomerTab) {
    const next = tab.status === "active" ? "suspended" : "active";
    startTransition(async () => {
      const res = await setCustomerTabStatusAction(slug, tab.id, next);
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setTabs((prev) =>
        prev.map((x) => (x.id === tab.id ? { ...x, status: next } : x)),
      );
    });
  }

  function openNewClientDialog() {
    setEditingClientId(null);
    setClientCompany("");
    setClientGstin("");
    setClientContact("");
    setClientPhone("");
    setClientEmail("");
    setClientAddress("");
    setClientStateCode(outlets[0]?.state_code || "36");
    setClientTerms("net_15");
    setClientLimit("50000");
    setClientModalOpen(true);
  }

  function openEditClientDialog(c: CorporateClient) {
    setEditingClientId(c.id);
    setClientCompany(c.company_name);
    setClientGstin(c.gstin ?? "");
    setClientContact(c.contact_person ?? "");
    setClientPhone(c.phone ?? "");
    setClientEmail(c.email ?? "");
    setClientAddress(c.billing_address ?? "");
    setClientStateCode(c.state_code ?? "36");
    setClientTerms((c.payment_terms as CorporatePaymentTerms) ?? "net_15");
    setClientLimit(String(Number(c.credit_limit ?? 50000)));
    setClientModalOpen(true);
  }

  function handleSaveClient(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    const stateObj = INDIAN_STATES.find((s) => s.code === clientStateCode);
    startTransition(async () => {
      const res = await saveCorporateClientAction(slug, {
        id: editingClientId ?? undefined,
        company_name: clientCompany,
        gstin: clientGstin,
        contact_person: clientContact,
        phone: clientPhone,
        email: clientEmail,
        billing_address: clientAddress,
        state_code: clientStateCode,
        state_name: stateObj?.name ?? "Telangana",
        payment_terms: clientTerms,
        credit_limit: Number(clientLimit) || 50000,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setClients((prev) => {
        const exists = prev.some((x) => x.id === res.client.id);
        return exists
          ? prev.map((x) => (x.id === res.client.id ? res.client : x))
          : [res.client, ...prev];
      });
      if (!invClientId) setInvClientId(res.client.id);
      setClientModalOpen(false);
      setBanner({
        kind: "ok",
        text: `Corporate client "${res.client.company_name}" saved.`,
      });
    });
  }

  function openNewInvoiceDialog() {
    const firstClient = clients[0];
    const outlet = outlets[0];
    setInvClientId(firstClient?.id ?? "");
    setInvOutletId(outlet?.id ?? "");
    setInvNumber(
      `INV-${todayDate.replaceAll("-", "").slice(0, 6)}-${String(invoices.length + 1).padStart(3, "0")}`,
    );
    setInvDate(todayDate);
    setInvPoRef("");
    const sellerState = outlet?.state_code || "36";
    const buyerState = firstClient?.state_code || "36";
    setInvSupplyType(sellerState === buyerState ? "intra" : "inter");
    setInvNotes("Thank you for your business. NEFT/UPI accepted.");
    setSelectedOrderIds([]);
    setInvLines([
      {
        description: "Corporate Dining & Catering Services (SAC 996331)",
        hsn_sac: "996331",
        qty: 1,
        unit_price: 2500,
        gst_rate: 5,
      },
    ]);
    setInvoiceModalOpen(true);
  }

  function handleSelectClientInInvoice(nextClientId: string) {
    setInvClientId(nextClientId);
    const cl = clientById.get(nextClientId);
    const out = outletById.get(invOutletId);
    if (cl && out?.state_code && cl.state_code) {
      setInvSupplyType(out.state_code === cl.state_code ? "intra" : "inter");
    }
  }

  function handleToggleOrderImport(ord: InvoiceSourceOrderRow) {
    setSelectedOrderIds((prev) => {
      const exists = prev.includes(ord.id);
      const next = exists
        ? prev.filter((id) => id !== ord.id)
        : [...prev, ord.id];
      const importedLines: CorporateInvoiceLineInput[] = next
        .map((id) => recentOrders.find((o) => o.id === id))
        .filter((o): o is InvoiceSourceOrderRow => Boolean(o))
        .map((o) => ({
          description: `Order #${o.unique_order_id ?? o.id.slice(0, 8)} · ${o.customer_name}`,
          hsn_sac: "996331",
          qty: 1,
          unit_price: Math.max(0, Math.round(o.subtotal * 100) / 100),
          gst_rate: 5,
        }));
      if (importedLines.length > 0) {
        setInvLines(importedLines);
      }
      return next;
    });
  }

  function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    const cl = clientById.get(invClientId);
    startTransition(async () => {
      const res = await createCorporateInvoiceAction(slug, {
        corporate_client_id: invClientId,
        outlet_id: invOutletId || null,
        invoice_number: invNumber,
        invoice_date: invDate,
        po_reference: invPoRef,
        place_of_supply: cl
          ? `${cl.state_code ?? "36"} - ${cl.state_name ?? "Telangana"}`
          : undefined,
        supply_type: invSupplyType,
        items: invLines,
        linked_order_ids: selectedOrderIds,
        notes: invNotes,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setInvoices((prev) => [res.invoice, ...prev]);
      setInvoiceModalOpen(false);
      setBanner({
        kind: "ok",
        text: `Generated B2B Tax Invoice ${res.invoice.invoice_number} for ${inrExact(Number(res.invoice.total_amount))}.`,
      });
    });
  }

  function handleRecordInvoicePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payInvoice) return;
    setBanner(null);
    startTransition(async () => {
      const res = await recordCorporateInvoicePaymentAction(slug, {
        invoice_id: payInvoice.id,
        amount: Number(payInvoiceAmount),
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === res.invoice.id ? res.invoice : inv)),
      );
      setPayInvoice(null);
      setBanner({
        kind: "ok",
        text: `Updated payment on ${res.invoice.invoice_number} (${res.invoice.payment_status.toUpperCase()}).`,
      });
    });
  }

  function handleCancelInvoice(inv: CorporateInvoice) {
    startTransition(async () => {
      const res = await cancelCorporateInvoiceAction(slug, inv.id);
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setInvoices((prev) =>
        prev.map((x) => (x.id === inv.id ? { ...x, status: "cancelled" } : x)),
      );
    });
  }

  function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    startTransition(async () => {
      const res = await createOutletExpenseAction(slug, {
        outlet_id: expOutletId || null,
        expense_date: expDate,
        category: expCategory,
        title: expTitle,
        amount: Number(expAmount),
        payment_mode: expMode,
        paid_to: expPaidTo,
        note: expNote,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setExpenses((prev) => [res.expense, ...prev]);
      setExpenseModalOpen(false);
      setExpTitle("");
      setExpAmount("");
      setExpPaidTo("");
      setExpNote("");
      setBanner({
        kind: "ok",
        text: `Recorded expense "${res.expense.title}" (${inrExact(Number(res.expense.amount))}).`,
      });
    });
  }

  function handleDeleteExpense(exp: OutletExpense) {
    startTransition(async () => {
      const res = await deleteOutletExpenseAction(slug, exp.id);
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setExpenses((prev) => prev.filter((x) => x.id !== exp.id));
    });
  }

  const ledgerTransactions = useMemo(
    () =>
      ledgerTab
        ? transactions.filter((tx) => tx.tab_id === ledgerTab.id)
        : [],
    [ledgerTab, transactions],
  );

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>People&apos;s Tabs Receivable</span>
              <Users className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {inr(totalTabReceivable)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {activeTabCount} active Khata accounts
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Corporate Billed</span>
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {inr(totalCorpBilled)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {issuedInvoices.length} GST tax invoices across {clients.length} clients
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Corporate Outstanding</span>
              <Receipt className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {inr(totalCorpReceivable)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {unpaidInvoicesCount} unpaid or partial invoices
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Petty Cash &amp; Expenses</span>
              <Wallet className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {inr(todayExpensesTotal)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Today · {inr(totalExpensesLogged)} total logged
            </div>
          </CardContent>
        </Card>
      </div>

      {banner && (
        <div
          role="status"
          className={cn(
            "rounded-lg border px-3.5 py-2 text-xs",
            banner.kind === "err"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
          )}
        >
          {banner.text}
        </div>
      )}

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="tabs">
            People&apos;s Tabs / Khata ({tabs.length})
          </TabsTrigger>
          <TabsTrigger value="invoices">
            Corporate GST Invoices ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="expenses">
            Petty Cash &amp; Expenses ({expenses.length})
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* TAB 1: PEOPLE'S TABS / KHATA                                     */}
        {/* ================================================================ */}
        <TabsContent value="tabs" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={tabSearch}
                onChange={(e) => setTabSearch(e.target.value)}
                placeholder="Search customer, phone, team…"
                className="h-8 pl-8 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    `peoples-tabs-${todayDate}.csv`,
                    ["Customer", "Phone", "Notes", "Balance", "Credit Limit", "Status"],
                    tabs.map((t) => [
                      t.customer_name,
                      t.phone ?? "",
                      t.company_or_notes ?? "",
                      Number(t.current_balance ?? 0).toFixed(2),
                      Number(t.credit_limit ?? 0).toFixed(2),
                      t.status,
                    ]),
                  )
                }
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button type="button" size="sm" onClick={openNewTabDialog}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Open Customer Tab
              </Button>
            </div>
          </div>

          {filteredTabs.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={Users}
                  title="No customer tabs yet"
                  description="Open credit tabs (Khata) for regular patrons, neighbors, or nearby office teams to bill from POS and settle weekly/monthly."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer / Account</TableHead>
                      <TableHead>Outlet</TableHead>
                      <TableHead className="text-right">Balance Due</TableHead>
                      <TableHead className="text-right">Credit Limit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTabs.map((t) => {
                      const bal = Number(t.current_balance ?? 0);
                      const lim = Number(t.credit_limit ?? 0);
                      const pct = lim > 0 ? Math.min(100, Math.round((bal / lim) * 100)) : 0;
                      const over = lim > 0 && bal > lim;
                      const digits = (t.phone ?? "").replace(/\D/g, "");
                      const waUrl = digits
                        ? `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}?text=${encodeURIComponent(
                            `Namaste ${t.customer_name}, gentle reminder from ${restaurantName}: your current Khata tab balance is ${inrExact(bal)}. Please settle at your convenience. Thank you!`,
                          )}`
                        : null;
                      const outletLabel = t.outlet_id
                        ? outletById.get(t.outlet_id)?.name ?? "All Outlets"
                        : "All Outlets";

                      return (
                        <TableRow key={t.id}>
                          <TableCell>
                            <div className="font-medium">{t.customer_name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {[t.phone, t.company_or_notes]
                                .filter(Boolean)
                                .join(" · ") || "Walk-in regular"}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {outletLabel}
                          </TableCell>
                          <TableCell className="text-right">
                            <div
                              className={cn(
                                "font-semibold tabular-nums",
                                bal > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700",
                              )}
                            >
                              {inrExact(bal)}
                            </div>
                            {lim > 0 && (
                              <div className="ml-auto mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    over ? "bg-destructive" : "bg-emerald-600",
                                  )}
                                  style={{ width: `${Math.max(0, pct)}%` }}
                                />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                            {inr(lim)}
                          </TableCell>
                          <TableCell>
                            {over ? (
                              <Badge variant="destructive">Over Limit</Badge>
                            ) : t.status === "active" ? (
                              <Badge variant="secondary">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="capitalize">
                                {t.status}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                onClick={() => openTabEntryDialog(t, "charge")}
                              >
                                + Charge
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                onClick={() => openTabEntryDialog(t, "payment")}
                              >
                                Settle
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                title="View ledger"
                                onClick={() => setLedgerTab(t)}
                              >
                                <History className="h-3.5 w-3.5" />
                              </Button>
                              {waUrl && bal > 0 && (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={buttonVariants({
                                    variant: "ghost",
                                    size: "icon-xs",
                                  })}
                                  title="Send WhatsApp reminder"
                                >
                                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                                </a>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => openEditTabDialog(t)}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={pending}
                                onClick={() => handleToggleTabStatus(t)}
                              >
                                {t.status === "active" ? "Pause" : "Activate"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB 2: CORPORATE ACCOUNTS & B2B GST TAX INVOICES                 */}
        {/* ================================================================ */}
        <TabsContent value="invoices" className="mt-4 space-y-5">
          {/* Corporate Clients Strip */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
              <div>
                <CardTitle className="text-sm">Corporate B2B Clients ({clients.length})</CardTitle>
                <CardDescription className="text-xs">
                  Store Buyer GSTINs, billing addresses, state codes, and credit terms for compliant B2B tax invoices.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openNewClientDialog}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Corporate Client
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={clients.length === 0}
                  onClick={openNewInvoiceDialog}
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  Generate GST Invoice
                </Button>
              </div>
            </CardHeader>
            {clients.length > 0 && (
              <CardContent className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {clients.map((cl) => (
                  <div
                    key={cl.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="truncate font-semibold text-foreground">
                        {cl.company_name}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {cl.gstin ? `GSTIN: ${cl.gstin}` : "Unregistered / No GSTIN"}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {[cl.contact_person, CORPORATE_PAYMENT_TERMS_LABEL[cl.payment_terms as CorporatePaymentTerms] ?? cl.payment_terms]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => openEditClientDialog(cl)}
                    >
                      Edit
                    </Button>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>

          {/* Corporate Invoice Register */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="Search invoice #, company, GSTIN…"
                className="h-8 pl-8 text-xs"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  `corporate-invoices-${todayDate}.csv`,
                  [
                    "Invoice #",
                    "Date",
                    "Client",
                    "GSTIN",
                    "Taxable",
                    "CGST",
                    "SGST",
                    "IGST",
                    "Total",
                    "Paid",
                    "Payment Status",
                  ],
                  invoices.map((inv) => {
                    const cl = clientById.get(inv.corporate_client_id);
                    return [
                      inv.invoice_number,
                      inv.invoice_date,
                      cl?.company_name ?? "",
                      cl?.gstin ?? "",
                      Number(inv.taxable_subtotal ?? 0).toFixed(2),
                      Number(inv.cgst_amount ?? 0).toFixed(2),
                      Number(inv.sgst_amount ?? 0).toFixed(2),
                      Number(inv.igst_amount ?? 0).toFixed(2),
                      Number(inv.total_amount ?? 0).toFixed(2),
                      Number(inv.amount_paid ?? 0).toFixed(2),
                      inv.payment_status,
                    ];
                  }),
                )
              }
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              GST Register CSV
            </Button>
          </div>

          {filteredInvoices.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={Receipt}
                  title="No corporate GST invoices yet"
                  description="Add a corporate client above and generate your first B2B tax invoice with SAC 996331 and printable A4 PDF view."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Corporate Client</TableHead>
                      <TableHead>Date / Due</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">GST</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((inv) => {
                      const cl = clientById.get(inv.corporate_client_id);
                      const gstTotal =
                        Number(inv.cgst_amount ?? 0) +
                        Number(inv.sgst_amount ?? 0) +
                        Number(inv.igst_amount ?? 0);
                      const remaining = Math.max(
                        0,
                        Number(inv.total_amount ?? 0) - Number(inv.amount_paid ?? 0),
                      );
                      return (
                        <TableRow key={inv.id}>
                          <TableCell>
                            <div className="font-mono text-xs font-semibold">
                              {inv.invoice_number}
                            </div>
                            {inv.po_reference && (
                              <div className="text-[11px] text-muted-foreground">
                                PO: {inv.po_reference}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {cl?.company_name ?? "Corporate Client"}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {cl?.gstin ?? "Unregistered"} ·{" "}
                              {inv.supply_type === "inter" ? "IGST" : "CGST+SGST"}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-muted-foreground">
                            <div>{inv.invoice_date}</div>
                            {inv.due_date && (
                              <div className="text-[11px]">Due {inv.due_date}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {inrExact(Number(inv.taxable_subtotal ?? 0))}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                            {inrExact(gstTotal)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="font-semibold tabular-nums">
                              {inrExact(Number(inv.total_amount ?? 0))}
                            </div>
                            {remaining > 0 && inv.status !== "cancelled" && (
                              <div className="text-[11px] text-amber-700 tabular-nums">
                                Due {inrExact(remaining)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {inv.status === "cancelled" ? (
                              <Badge variant="outline">Cancelled</Badge>
                            ) : inv.payment_status === "paid" ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700">
                                Paid
                              </Badge>
                            ) : inv.payment_status === "partial" ? (
                              <Badge className="bg-amber-500/15 text-amber-800">
                                Partial
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Unpaid</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Link
                                href={`/r/${slug}/admin/accounts/invoices/${inv.id}/print`}
                                target="_blank"
                                className={buttonVariants({
                                  variant: "outline",
                                  size: "xs",
                                })}
                              >
                                <Printer className="mr-1 h-3 w-3" />
                                Print A4
                              </Link>
                              {inv.status !== "cancelled" &&
                                inv.payment_status !== "paid" && (
                                  <Button
                                    type="button"
                                    size="xs"
                                    onClick={() => {
                                      setPayInvoice(inv);
                                      setPayInvoiceAmount(String(remaining.toFixed(2)));
                                    }}
                                  >
                                    <CreditCard className="mr-1 h-3 w-3" />
                                    Pay
                                  </Button>
                                )}
                              {inv.status !== "cancelled" && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  disabled={pending}
                                  onClick={() => handleCancelInvoice(inv)}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  Void
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB 3: PETTY CASH & OUTLET EXPENSES                              */}
        {/* ================================================================ */}
        <TabsContent value="expenses" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setExpenseCategoryFilter("all")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  expenseCategoryFilter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                All ({expenses.length})
              </button>
              {EXPENSE_CATEGORIES.slice(0, 6).map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setExpenseCategoryFilter(cat.value)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                    expenseCategoryFilter === cat.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    `outlet-expenses-${todayDate}.csv`,
                    ["Date", "Category", "Description", "Paid To", "Mode", "Amount"],
                    filteredExpenses.map((ex) => [
                      ex.expense_date,
                      EXPENSE_CATEGORY_LABEL[ex.category as ExpenseCategory] ??
                        ex.category,
                      ex.title,
                      ex.paid_to ?? "",
                      ex.payment_mode,
                      Number(ex.amount ?? 0).toFixed(2),
                    ]),
                  )
                }
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setExpOutletId(outlets[0]?.id ?? "");
                  setExpDate(todayDate);
                  setExpenseModalOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Record Expense
              </Button>
            </div>
          </div>

          {filteredExpenses.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={IndianRupee}
                  title="No outlet expenses recorded"
                  description="Track daily petty cash payouts, gas cylinders, urgent produce buys, and repairs — synced with Day-End Register."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Outlet</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Delete</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map((ex) => (
                      <TableRow key={ex.id}>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {ex.expense_date}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{ex.title}</div>
                          {(ex.paid_to || ex.note) && (
                            <div className="text-[11px] text-muted-foreground">
                              {[ex.paid_to && `Paid to ${ex.paid_to}`, ex.note]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px] font-normal">
                            {EXPENSE_CATEGORY_LABEL[
                              ex.category as ExpenseCategory
                            ] ?? ex.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {ex.outlet_id
                            ? outletById.get(ex.outlet_id)?.name ?? "Outlet"
                            : "Shared"}
                        </TableCell>
                        <TableCell className="text-xs uppercase text-muted-foreground">
                          {TAB_PAYMENT_MODE_LABEL[
                            ex.payment_mode as TabPaymentMode
                          ] ?? ex.payment_mode}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {inrExact(Number(ex.amount ?? 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={pending}
                            onClick={() => handleDeleteExpense(ex)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ================================================================== */}
      {/* DIALOGS                                                            */}
      {/* ================================================================== */}

      {/* Open / Edit Customer Tab */}
      <Dialog open={tabModalOpen} onOpenChange={setTabModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTabId ? "Edit Customer Tab" : "Open Customer Credit Tab"}
            </DialogTitle>
            <DialogDescription>
              Regular patrons &amp; local offices can charge orders at the POS and settle weekly/monthly.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveTab} className="grid gap-3.5">
            <div className="grid gap-1.5">
              <Label className="text-xs">Customer / Team Name *</Label>
              <Input
                value={tabName}
                onChange={(e) => setTabName(e.target.value)}
                placeholder="e.g. Karthik Reddy (TechPark Wing B)"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={tabPhone}
                  onChange={(e) => setTabPhone(e.target.value)}
                  placeholder="+91 98480..."
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Credit Limit (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step="100"
                  value={tabLimit}
                  onChange={(e) => setTabLimit(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={tabEmail}
                  onChange={(e) => setTabEmail(e.target.value)}
                  placeholder="optional"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Primary Outlet</Label>
                <select
                  value={tabOutletId}
                  onChange={(e) => setTabOutletId(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                >
                  <option value="">All Outlets</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Company / Notes</Label>
              <Input
                value={tabNotes}
                onChange={(e) => setTabNotes(e.target.value)}
                placeholder="Settles every Friday via UPI"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setTabModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save Tab
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Charge / Settle Tab Entry */}
      <Dialog
        open={entryModalTab !== null}
        onOpenChange={(open) => {
          if (!open) setEntryModalTab(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {entryType === "charge"
                ? `Charge to ${entryModalTab?.customer_name}`
                : entryType === "payment"
                  ? `Settle ${entryModalTab?.customer_name}'s Tab`
                  : `Credit Adjustment (${entryModalTab?.customer_name})`}
            </DialogTitle>
            <DialogDescription>
              Current balance: {inrExact(Number(entryModalTab?.current_balance ?? 0))} · Limit:{" "}
              {inr(Number(entryModalTab?.credit_limit ?? 0))}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordTabEntry} className="grid gap-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Entry Type</Label>
                <select
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value as TabEntryType)}
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                >
                  <option value="charge">Charge (+ Due)</option>
                  <option value="payment">Payment (- Due)</option>
                  <option value="credit_note">Credit Note / Waive</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Amount (₹) *</Label>
                <Input
                  type="number"
                  min={1}
                  step="0.01"
                  value={entryAmount}
                  onChange={(e) => setEntryAmount(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            {entryType === "payment" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Payment Mode</Label>
                  <select
                    value={entryMode}
                    onChange={(e) =>
                      setEntryMode(e.target.value as TabPaymentMode)
                    }
                    className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                  >
                    {TAB_PAYMENT_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Reference / UTR</Label>
                  <Input
                    value={entryRef}
                    onChange={(e) => setEntryRef(e.target.value)}
                    placeholder="UTR or Receipt #"
                  />
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label className="text-xs">Note</Label>
              <Input
                value={entryNote}
                onChange={(e) => setEntryNote(e.target.value)}
                placeholder="e.g. Lunch combo for 4 · Weekly settlement"
              />
            </div>

            {entryType === "charge" && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allowOverLimit}
                  onChange={(e) => setAllowOverLimit(e.target.checked)}
                />
                Allow manager override if exceeding credit limit
              </label>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setEntryModalTab(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save Entry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tab Ledger Statement */}
      <Dialog
        open={ledgerTab !== null}
        onOpenChange={(open) => {
          if (!open) setLedgerTab(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Khata Ledger — {ledgerTab?.customer_name}
            </DialogTitle>
            <DialogDescription>
              Closing balance: {inrExact(Number(ledgerTab?.current_balance ?? 0))}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            {ledgerTransactions.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No ledger entries recorded yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTimestamp(tx.recorded_at)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium capitalize">
                          {tx.entry_type.replace("_", " ")}
                          {tx.payment_mode
                            ? ` (${TAB_PAYMENT_MODE_LABEL[tx.payment_mode as TabPaymentMode] ?? tx.payment_mode})`
                            : ""}
                        </div>
                        {(tx.note || tx.reference_no) && (
                          <div className="text-[11px] text-muted-foreground">
                            {[tx.note, tx.reference_no].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-xs font-semibold tabular-nums",
                          tx.entry_type === "charge"
                            ? "text-amber-700"
                            : "text-emerald-700",
                        )}
                      >
                        {tx.entry_type === "charge" ? "+" : "-"}
                        {inrExact(Number(tx.amount))}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {inrExact(Number(tx.balance_after))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Corporate Client Dialog */}
      <Dialog open={clientModalOpen} onOpenChange={setClientModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingClientId ? "Edit Corporate Client" : "Add Corporate Client"}
            </DialogTitle>
            <DialogDescription>
              Saved B2B buyer details appear on printed GST Tax Invoices.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveClient} className="grid gap-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Company Name *</Label>
                <Input
                  value={clientCompany}
                  onChange={(e) => setClientCompany(e.target.value)}
                  placeholder="Acme Cloud India Pvt Ltd"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Buyer GSTIN (15-char)</Label>
                <Input
                  value={clientGstin}
                  onChange={(e) => setClientGstin(e.target.value.toUpperCase())}
                  placeholder="36AABCA1234F1Z5"
                  maxLength={15}
                  className="font-mono uppercase"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Contact Person</Label>
                <Input
                  value={clientContact}
                  onChange={(e) => setClientContact(e.target.value)}
                  placeholder="Finance / Admin"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Billing Email</Label>
                <Input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="ap@company.com"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Billing Address</Label>
              <Textarea
                rows={2}
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder="Floor 9, Mindspace Cyberabad, Hyderabad 500081"
                className="text-xs"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">State / Place of Supply</Label>
                <select
                  value={clientStateCode}
                  onChange={(e) => setClientStateCode(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                >
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Payment Terms</Label>
                <select
                  value={clientTerms}
                  onChange={(e) =>
                    setClientTerms(e.target.value as CorporatePaymentTerms)
                  }
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                >
                  {CORPORATE_PAYMENT_TERMS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Credit Limit (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={clientLimit}
                  onChange={(e) => setClientLimit(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setClientModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save Client
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generate Corporate GST Invoice Dialog */}
      <Dialog open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate B2B Corporate GST Invoice</DialogTitle>
            <DialogDescription>
              Build from existing settled orders or custom corporate catering SAC 996331 line items.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateInvoice} className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Corporate Client *</Label>
                <select
                  value={invClientId}
                  onChange={(e) => handleSelectClientInInvoice(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                  required
                >
                  {clients.map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.company_name} {cl.gstin ? `(${cl.gstin})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Billing Outlet</Label>
                <select
                  value={invOutletId}
                  onChange={(e) => setInvOutletId(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                >
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} {o.gstin ? `(${o.gstin})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Invoice #</Label>
                <Input
                  value={invNumber}
                  onChange={(e) => setInvNumber(e.target.value.toUpperCase())}
                  required
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Invoice Date</Label>
                <Input
                  type="date"
                  value={invDate}
                  onChange={(e) => setInvDate(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">PO Reference #</Label>
                <Input
                  value={invPoRef}
                  onChange={(e) => setInvPoRef(e.target.value)}
                  placeholder="PO-2026-88"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">GST Mode</Label>
                <select
                  value={invSupplyType}
                  onChange={(e) =>
                    setInvSupplyType(e.target.value as "intra" | "inter")
                  }
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                >
                  <option value="intra">Intra-state (CGST+SGST)</option>
                  <option value="inter">Inter-state (IGST)</option>
                </select>
              </div>
            </div>

            {recentOrders.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Optional: Import from Recent Settled Orders ({selectedOrderIds.length} selected)
                </Label>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2">
                  {recentOrders.slice(0, 18).map((ord) => {
                    const checked = selectedOrderIds.includes(ord.id);
                    return (
                      <button
                        key={ord.id}
                        type="button"
                        onClick={() => handleToggleOrderImport(ord)}
                        className={cn(
                          "rounded-md border px-2 py-1 text-[11px] tabular-nums transition-colors",
                          checked
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:text-foreground",
                        )}
                      >
                        #{ord.unique_order_id ?? ord.id.slice(0, 6)} · {ord.customer_name} ·{" "}
                        {inr(ord.total_amount)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Line Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    setInvLines((prev) => [
                      ...prev,
                      {
                        description: "",
                        hsn_sac: "996331",
                        qty: 1,
                        unit_price: 500,
                        gst_rate: 5,
                      },
                    ])
                  }
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Row
                </Button>
              </div>

              <div className="space-y-2">
                {invLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 items-center gap-2">
                    <Input
                      className="col-span-5 h-8 text-xs"
                      placeholder="Item or catering description"
                      value={line.description}
                      onChange={(e) =>
                        setInvLines((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, description: e.target.value } : x,
                          ),
                        )
                      }
                      required
                    />
                    <Input
                      className="col-span-2 h-8 font-mono text-xs"
                      placeholder="SAC"
                      value={line.hsn_sac ?? "996331"}
                      onChange={(e) =>
                        setInvLines((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, hsn_sac: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Input
                      className="col-span-1 h-8 px-1.5 text-right text-xs"
                      type="number"
                      min={1}
                      value={line.qty}
                      onChange={(e) =>
                        setInvLines((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, qty: Number(e.target.value) || 1 } : x,
                          ),
                        )
                      }
                    />
                    <Input
                      className="col-span-2 h-8 text-right text-xs"
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unit_price}
                      onChange={(e) =>
                        setInvLines((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? { ...x, unit_price: Number(e.target.value) || 0 }
                              : x,
                          ),
                        )
                      }
                    />
                    <div className="col-span-2 flex items-center gap-1">
                      <select
                        value={line.gst_rate ?? 5}
                        onChange={(e) =>
                          setInvLines((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, gst_rate: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                        className="h-8 flex-1 rounded-md border border-input bg-card px-1 text-xs"
                      >
                        <option value={0}>0%</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                      </select>
                      {invLines.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() =>
                            setInvLines((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-4 rounded-lg bg-muted/40 px-3 py-2 text-xs tabular-nums">
                <span>Taxable: {inrExact(previewInvoiceTotals.taxableSubtotal)}</span>
                {invSupplyType === "intra" ? (
                  <>
                    <span>CGST: {inrExact(previewInvoiceTotals.cgstAmount)}</span>
                    <span>SGST: {inrExact(previewInvoiceTotals.sgstAmount)}</span>
                  </>
                ) : (
                  <span>IGST: {inrExact(previewInvoiceTotals.igstAmount)}</span>
                )}
                <span className="font-semibold text-foreground">
                  Total: {inrExact(previewInvoiceTotals.totalAmount)}
                </span>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Invoice Terms / Notes</Label>
              <Input
                value={invNotes}
                onChange={(e) => setInvNotes(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setInvoiceModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Issue Tax Invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Corporate Invoice Payment Dialog */}
      <Dialog
        open={payInvoice !== null}
        onOpenChange={(open) => {
          if (!open) setPayInvoice(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Invoice Payment</DialogTitle>
            <DialogDescription>
              Invoice {payInvoice?.invoice_number} · Total{" "}
              {inrExact(Number(payInvoice?.total_amount ?? 0))}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordInvoicePayment} className="grid gap-3.5">
            <div className="grid gap-1.5">
              <Label className="text-xs">Amount Received (₹) *</Label>
              <Input
                type="number"
                min={1}
                step="0.01"
                value={payInvoiceAmount}
                onChange={(e) => setPayInvoiceAmount(e.target.value)}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setPayInvoice(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Outlet Expense Dialog */}
      <Dialog open={expenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Petty Cash / Outlet Expense</DialogTitle>
            <DialogDescription>
              Saved operational expenses in Cash mode automatically adjust Day-End Register cash expectations.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateExpense} className="grid gap-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Date *</Label>
                <Input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Category *</Label>
                <select
                  value={expCategory}
                  onChange={(e) =>
                    setExpCategory(e.target.value as ExpenseCategory)
                  }
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Expense Description *</Label>
              <Input
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                placeholder="e.g. Morning market coriander & green chillies"
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Amount (₹) *</Label>
                <Input
                  type="number"
                  min={1}
                  step="0.01"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Paid Via</Label>
                <select
                  value={expMode}
                  onChange={(e) => setExpMode(e.target.value as TabPaymentMode)}
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                >
                  {TAB_PAYMENT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Outlet</Label>
                <select
                  value={expOutletId}
                  onChange={(e) => setExpOutletId(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                >
                  <option value="">Shared</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Paid To</Label>
                <Input
                  value={expPaidTo}
                  onChange={(e) => setExpPaidTo(e.target.value)}
                  placeholder="Vendor or staff name"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Note</Label>
                <Input
                  value={expNote}
                  onChange={(e) => setExpNote(e.target.value)}
                  placeholder="Optional note"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setExpenseModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save Expense
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
