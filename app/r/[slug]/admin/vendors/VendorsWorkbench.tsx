"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building,
  CheckCircle2,
  ClipboardList,
  Download,
  IndianRupee,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
  XCircle,
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
import type {
  AppRole,
  Outlet,
  Vendor,
  VendorPayment,
  VendorPurchaseOrder,
} from "@/lib/types";
import {
  computePurchaseOrderTotals,
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABEL,
  VENDOR_PAYMENT_MODE_LABEL,
  VENDOR_PAYMENT_MODES,
  VENDOR_PAYMENT_TERMS,
  VENDOR_PAYMENT_TERMS_LABEL,
  type PurchaseOrderItemInput,
  type VendorCategory,
  type VendorPaymentMode,
  type VendorPaymentTerms,
} from "@/lib/vendors";
import {
  createPurchaseOrderAction,
  deleteVendorAction,
  recordVendorPaymentAction,
  saveVendorAction,
  updatePurchaseOrderStatusAction,
} from "./actions";

export type VendorBalanceSummary = {
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
};

type Props = {
  slug: string;
  role: AppRole;
  todayDate: string;
  outlets: Outlet[];
  vendors: Vendor[];
  purchaseOrders: VendorPurchaseOrder[];
  payments: VendorPayment[];
  balanceByVendorId: Record<string, VendorBalanceSummary>;
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function escapeCsv(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const EMPTY_PO_LINE: PurchaseOrderItemInput = {
  name: "",
  unit: "kg",
  qty: 1,
  unit_cost: 0,
  gst_rate: 5,
};

export function VendorsWorkbench({
  slug,
  role,
  todayDate,
  outlets,
  vendors,
  purchaseOrders,
  payments,
  balanceByVendorId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  // Filters
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("__all__");
  const [poStatusFilter, setPoStatusFilter] = useState("__all__");
  const [paymentVendorFilter, setPaymentVendorFilter] = useState("__all__");

  // Vendor Add/Edit Dialog
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [vCode, setVCode] = useState("");
  const [vName, setVName] = useState("");
  const [vCategory, setVCategory] = useState("grocery");
  const [vContact, setVContact] = useState("");
  const [vPhone, setVPhone] = useState("");
  const [vEmail, setVEmail] = useState("");
  const [vGstin, setVGstin] = useState("");
  const [vAddress, setVAddress] = useState("");
  const [vTerms, setVTerms] = useState("cod");
  const [vUpi, setVUpi] = useState("");
  const [vStatus, setVStatus] = useState("active");
  const [vNotes, setVNotes] = useState("");

  // New PO Dialog
  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [poVendorId, setPoVendorId] = useState("");
  const [poOutletId, setPoOutletId] = useState("__all__");
  const [poNumber, setPoNumber] = useState("");
  const [poOrderDate, setPoOrderDate] = useState(todayDate);
  const [poExpectedDate, setPoExpectedDate] = useState("");
  const [poNotes, setPoNotes] = useState("");
  const [poLines, setPoLines] = useState<PurchaseOrderItemInput[]>([
    { ...EMPTY_PO_LINE },
  ]);

  // Receive Goods Dialog
  const [receivePo, setReceivePo] = useState<VendorPurchaseOrder | null>(null);
  const [receiveInvoiceNo, setReceiveInvoiceNo] = useState("");

  // Record Payment Dialog
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payVendorId, setPayVendorId] = useState("");
  const [payPoId, setPayPoId] = useState("__none__");
  const [payDate, setPayDate] = useState(todayDate);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("upi");
  const [payRef, setPayRef] = useState("");
  const [payNote, setPayNote] = useState("");

  const vendorById = useMemo(
    () => new Map(vendors.map((v) => [v.id, v])),
    [vendors],
  );
  const outletById = useMemo(
    () => new Map(outlets.map((o) => [o.id, o])),
    [outlets],
  );
  const poById = useMemo(
    () => new Map(purchaseOrders.map((p) => [p.id, p])),
    [purchaseOrders],
  );

  // KPI metrics
  const activeVendors = useMemo(
    () => vendors.filter((v) => v.status === "active"),
    [vendors],
  );
  const openPoCount = useMemo(
    () =>
      purchaseOrders.filter(
        (p) => p.status === "ordered" || p.status === "draft",
      ).length,
    [purchaseOrders],
  );
  const totalOutstanding = useMemo(
    () =>
      Object.values(balanceByVendorId).reduce(
        (s, b) => s + Math.max(0, b.outstanding),
        0,
      ),
    [balanceByVendorId],
  );
  const totalPayments30d = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return payments
      .filter((p) => p.payment_date >= cutoff)
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
  }, [payments]);

  const poPreviewTotals = useMemo(
    () => computePurchaseOrderTotals(poLines),
    [poLines],
  );

  const filteredVendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (catFilter !== "__all__" && v.category !== catFilter) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.vendor_code.toLowerCase().includes(q) ||
        (v.contact_person ?? "").toLowerCase().includes(q) ||
        (v.phone ?? "").toLowerCase().includes(q) ||
        (v.gstin ?? "").toLowerCase().includes(q)
      );
    });
  }, [vendors, search, catFilter]);

  const filteredPos = useMemo(() => {
    return purchaseOrders.filter((po) => {
      if (poStatusFilter === "__all__") return true;
      if (poStatusFilter === "unpaid_or_partial") {
        return po.status !== "cancelled" && po.payment_status !== "paid";
      }
      return po.status === poStatusFilter;
    });
  }, [purchaseOrders, poStatusFilter]);

  const filteredPayments = useMemo(() => {
    if (paymentVendorFilter === "__all__") return payments;
    return payments.filter((p) => p.vendor_id === paymentVendorFilter);
  }, [payments, paymentVendorFilter]);

  const openPosForSelectedVendor = useMemo(() => {
    if (!payVendorId) return [];
    return purchaseOrders.filter(
      (p) =>
        p.vendor_id === payVendorId &&
        p.status !== "cancelled" &&
        p.payment_status !== "paid",
    );
  }, [purchaseOrders, payVendorId]);

  function openNewVendorDialog() {
    setEditingVendorId(null);
    setVCode("");
    setVName("");
    setVCategory("grocery");
    setVContact("");
    setVPhone("");
    setVEmail("");
    setVGstin("");
    setVAddress("");
    setVTerms("cod");
    setVUpi("");
    setVStatus("active");
    setVNotes("");
    setVendorDialogOpen(true);
  }

  function openEditVendorDialog(v: Vendor) {
    setEditingVendorId(v.id);
    setVCode(v.vendor_code);
    setVName(v.name);
    setVCategory(v.category);
    setVContact(v.contact_person ?? "");
    setVPhone(v.phone ?? "");
    setVEmail(v.email ?? "");
    setVGstin(v.gstin ?? "");
    setVAddress(v.address ?? "");
    setVTerms(v.payment_terms);
    setVUpi(v.upi_or_bank ?? "");
    setVStatus(v.status);
    setVNotes(v.notes ?? "");
    setVendorDialogOpen(true);
  }

  function openNewPoDialog(preselectVendorId?: string) {
    setPoVendorId(preselectVendorId ?? activeVendors[0]?.id ?? "");
    setPoOutletId(outlets[0]?.id ?? "__all__");
    setPoNumber("");
    setPoOrderDate(todayDate);
    setPoExpectedDate("");
    setPoNotes("");
    setPoLines([{ ...EMPTY_PO_LINE }]);
    setPoDialogOpen(true);
  }

  function openPaymentDialog(
    preselectVendorId?: string,
    preselectPo?: VendorPurchaseOrder,
  ) {
    const vid = preselectPo?.vendor_id ?? preselectVendorId ?? activeVendors[0]?.id ?? "";
    setPayVendorId(vid);
    setPayPoId(preselectPo?.id ?? "__none__");
    setPayDate(todayDate);
    if (preselectPo) {
      const rem = Math.max(
        0,
        Number(preselectPo.total_amount ?? 0) -
          Number(preselectPo.amount_paid ?? 0),
      );
      setPayAmount(rem > 0 ? String(Math.round(rem * 100) / 100) : "");
    } else {
      setPayAmount("");
    }
    setPayMode("upi");
    setPayRef("");
    setPayNote("");
    setPayDialogOpen(true);
  }

  function handleSaveVendor(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    startTransition(async () => {
      const res = await saveVendorAction(slug, {
        id: editingVendorId,
        vendorCode: vCode,
        name: vName,
        category: vCategory,
        contactPerson: vContact,
        phone: vPhone,
        email: vEmail,
        gstin: vGstin,
        address: vAddress,
        paymentTerms: vTerms,
        upiOrBank: vUpi,
        status: vStatus,
        notes: vNotes,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setVendorDialogOpen(false);
      setBanner({
        kind: "ok",
        text: editingVendorId ? "Vendor updated." : "Vendor added.",
      });
      router.refresh();
    });
  }

  function handleDeleteVendor(v: Vendor) {
    if (!confirm(`Delete supplier "${v.name}" (${v.vendor_code})?`)) return;
    setBanner(null);
    startTransition(async () => {
      const res = await deleteVendorAction(slug, v.id);
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setBanner({ kind: "ok", text: `Deleted ${v.name}.` });
      router.refresh();
    });
  }

  function handleCreatePo(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    startTransition(async () => {
      const res = await createPurchaseOrderAction(slug, {
        vendorId: poVendorId,
        outletId: poOutletId,
        poNumber,
        orderDate: poOrderDate,
        expectedDate: poExpectedDate || null,
        notes: poNotes,
        items: poLines,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setPoDialogOpen(false);
      setBanner({
        kind: "ok",
        text: `Created Purchase Order ${res.poNumber}.`,
      });
      router.refresh();
    });
  }

  function handleConfirmReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!receivePo) return;
    setBanner(null);
    startTransition(async () => {
      const res = await updatePurchaseOrderStatusAction(slug, {
        poId: receivePo.id,
        status: "received",
        invoiceNumber: receiveInvoiceNo,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setReceivePo(null);
      setReceiveInvoiceNo("");
      setBanner({
        kind: "ok",
        text: `Marked ${receivePo.po_number} as Goods Received.`,
      });
      router.refresh();
    });
  }

  function handleCancelPo(po: VendorPurchaseOrder) {
    if (!confirm(`Cancel Purchase Order ${po.po_number}?`)) return;
    setBanner(null);
    startTransition(async () => {
      const res = await updatePurchaseOrderStatusAction(slug, {
        poId: po.id,
        status: "cancelled",
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setBanner({ kind: "ok", text: `Cancelled ${po.po_number}.` });
      router.refresh();
    });
  }

  function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    startTransition(async () => {
      const res = await recordVendorPaymentAction(slug, {
        vendorId: payVendorId,
        purchaseOrderId: payPoId,
        paymentDate: payDate,
        amount: Number(payAmount),
        paymentMode: payMode,
        referenceNo: payRef,
        note: payNote,
      });
      if (!res.ok) {
        setBanner({ kind: "err", text: res.error });
        return;
      }
      setPayDialogOpen(false);
      setBanner({ kind: "ok", text: "Vendor payment recorded." });
      router.refresh();
    });
  }

  function exportPaymentsCsv() {
    const header = [
      "Date",
      "Vendor Code",
      "Vendor Name",
      "PO Number",
      "Mode",
      "Reference",
      "Amount",
      "Note",
    ].join(",");

    const lines = filteredPayments.map((p) => {
      const v = vendorById.get(p.vendor_id);
      const po = p.purchase_order_id ? poById.get(p.purchase_order_id) : null;
      return [
        escapeCsv(p.payment_date),
        escapeCsv(v?.vendor_code),
        escapeCsv(v?.name),
        escapeCsv(po?.po_number),
        escapeCsv(p.payment_mode),
        escapeCsv(p.reference_no),
        escapeCsv(p.amount),
        escapeCsv(p.note),
      ].join(",");
    });

    const blob = new Blob([[header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billjot-vendor-payments-${todayDate}.csv`;
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
              <Building className="h-3.5 w-3.5 text-primary" />
              Active Vendors
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {activeVendors.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {vendors.length} total registered suppliers
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-sky-600" />
              Open Purchase Orders
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {openPoCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Awaiting kitchen / store delivery
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5 text-amber-600" />
              Outstanding Payables
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {inr(totalOutstanding)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Net balance across all suppliers
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5">
              <IndianRupee className="h-3.5 w-3.5 text-emerald-600" />
              Paid (Last 30 Days)
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {inr(totalPayments30d)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Recorded supplier settlements
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

      <Tabs defaultValue="vendors" onValueChange={() => setBanner(null)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="vendors">Suppliers</TabsTrigger>
          <TabsTrigger value="pos">Purchase Orders &amp; GRN</TabsTrigger>
          <TabsTrigger value="payments">Payments &amp; Ledger</TabsTrigger>
        </TabsList>

        {/* 1. SUPPLIERS */}
        <TabsContent value="vendors" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search supplier, phone, GSTIN…"
                  className="h-8 w-56 pl-8 text-xs"
                />
              </div>

              <Select
                value={catFilter}
                onValueChange={(v) => setCatFilter(v ?? "__all__")}
              >
                <SelectTrigger size="sm" className="w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All categories</SelectItem>
                  {VENDOR_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button size="sm" onClick={openNewVendorDialog}>
              <Plus className="h-3.5 w-3.5" />
              Add Vendor
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Category &amp; Terms</TableHead>
                    <TableHead>Contact / GSTIN</TableHead>
                    <TableHead className="text-right">Balance Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendors.map((v) => {
                    const bal = balanceByVendorId[v.id] ?? {
                      totalBilled: 0,
                      totalPaid: 0,
                      outstanding: 0,
                    };
                    return (
                      <TableRow key={v.id}>
                        <TableCell>
                          <div className="font-medium">{v.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {v.vendor_code}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">
                            {VENDOR_CATEGORY_LABEL[v.category as VendorCategory] ??
                              v.category}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {VENDOR_PAYMENT_TERMS_LABEL[
                              v.payment_terms as VendorPaymentTerms
                            ] ?? v.payment_terms}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div>
                            {[v.contact_person, v.phone]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </div>
                          {v.gstin && (
                            <div className="font-mono text-[11px]">
                              GSTIN: {v.gstin}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div
                            className={cn(
                              "font-semibold",
                              bal.outstanding > 0.01
                                ? "text-amber-700"
                                : "text-foreground",
                            )}
                          >
                            {inr(bal.outstanding)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Billed {inr(bal.totalBilled)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              v.status === "active" ? "default" : "secondary"
                            }
                          >
                            {v.status === "active" ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => openNewPoDialog(v.id)}
                            >
                              New PO
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => openPaymentDialog(v.id)}
                            >
                              Pay
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label={`Edit ${v.name}`}
                              onClick={() => openEditVendorDialog(v)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {role === "admin" && (
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                aria-label={`Delete ${v.name}`}
                                disabled={pending}
                                onClick={() => handleDeleteVendor(v)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredVendors.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-10 text-center text-xs text-muted-foreground"
                      >
                        No vendors match your filters. Click Add Vendor to register
                        a supplier.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. PURCHASE ORDERS & GRN */}
        <TabsContent value="pos" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Select
              value={poStatusFilter}
              onValueChange={(v) => setPoStatusFilter(v ?? "__all__")}
            >
              <SelectTrigger size="sm" className="w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Purchase Orders</SelectItem>
                <SelectItem value="ordered">Ordered (Awaiting GRN)</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="unpaid_or_partial">Unpaid / Partial</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Button
              size="sm"
              disabled={activeVendors.length === 0}
              onClick={() => openNewPoDialog()}
            >
              <Plus className="h-3.5 w-3.5" />
              New Purchase Order
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO # &amp; Date</TableHead>
                    <TableHead>Vendor &amp; Outlet</TableHead>
                    <TableHead>Items Summary</TableHead>
                    <TableHead className="text-right">Total (incl. GST)</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPos.map((po) => {
                    const v = vendorById.get(po.vendor_id);
                    const outlet = po.outlet_id
                      ? outletById.get(po.outlet_id)
                      : null;
                    const itemsList = Array.isArray(po.items)
                      ? (po.items as Array<{
                          name?: string;
                          qty?: number;
                          unit?: string;
                        }>)
                      : [];
                    return (
                      <TableRow key={po.id}>
                        <TableCell>
                          <div className="font-mono text-xs font-semibold">
                            {po.po_number}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {po.order_date}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {v?.name ?? "Vendor"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {outlet?.name ?? "All Outlets"}
                            {po.invoice_number ? ` · Inv #${po.invoice_number}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs text-xs text-muted-foreground">
                          <div className="truncate">
                            {itemsList
                              .slice(0, 3)
                              .map(
                                (it) =>
                                  `${it.qty ?? 1} ${it.unit ?? ""} ${it.name ?? "Item"}`,
                              )
                              .join(", ")}
                            {itemsList.length > 3
                              ? ` +${itemsList.length - 3} more`
                              : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div className="font-semibold">
                            {inr(Number(po.total_amount ?? 0))}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Paid {inr(Number(po.amount_paid ?? 0))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              po.status === "received"
                                ? "default"
                                : po.status === "cancelled"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {po.status === "received"
                              ? "Received"
                              : po.status === "cancelled"
                                ? "Cancelled"
                                : po.status === "draft"
                                  ? "Draft"
                                  : "Ordered"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              po.payment_status === "paid"
                                ? "default"
                                : po.payment_status === "partial"
                                  ? "outline"
                                  : "secondary"
                            }
                          >
                            {po.payment_status === "paid"
                              ? "Paid"
                              : po.payment_status === "partial"
                                ? "Partial"
                                : "Unpaid"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            {(po.status === "ordered" || po.status === "draft") && (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => {
                                  setReceivePo(po);
                                  setReceiveInvoiceNo(po.invoice_number ?? "");
                                }}
                              >
                                <PackageCheck className="h-3 w-3" />
                                Receive
                              </Button>
                            )}
                            {po.status !== "cancelled" &&
                              po.payment_status !== "paid" && (
                                <Button
                                  size="xs"
                                  onClick={() =>
                                    openPaymentDialog(po.vendor_id, po)
                                  }
                                >
                                  Pay
                                </Button>
                              )}
                            {(po.status === "ordered" || po.status === "draft") &&
                              Number(po.amount_paid ?? 0) === 0 && (
                                <Button
                                  size="icon-xs"
                                  variant="ghost"
                                  aria-label={`Cancel ${po.po_number}`}
                                  disabled={pending}
                                  onClick={() => handleCancelPo(po)}
                                >
                                  <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredPos.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-10 text-center text-xs text-muted-foreground"
                      >
                        No purchase orders in this view. Click New Purchase Order to
                        create one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. PAYMENTS & LEDGER */}
        <TabsContent value="payments" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Select
              value={paymentVendorFilter}
              onValueChange={(v) => setPaymentVendorFilter(v ?? "__all__")}
            >
              <SelectTrigger size="sm" className="w-52 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All suppliers</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={filteredPayments.length === 0}
                onClick={exportPaymentsCsv}
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button
                size="sm"
                disabled={activeVendors.length === 0}
                onClick={() => openPaymentDialog()}
              >
                <Plus className="h-3.5 w-3.5" />
                Record Payment
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Linked PO</TableHead>
                    <TableHead>Mode &amp; Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((p) => {
                    const v = vendorById.get(p.vendor_id);
                    const po = p.purchase_order_id
                      ? poById.get(p.purchase_order_id)
                      : null;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs tabular-nums">
                          {p.payment_date}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {v?.name ?? "Vendor"}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {v?.vendor_code}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {po ? po.po_number : "On Account"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>
                            {VENDOR_PAYMENT_MODE_LABEL[
                              p.payment_mode as VendorPaymentMode
                            ] ?? p.payment_mode}
                          </div>
                          {p.reference_no && (
                            <div className="font-mono text-[11px] text-muted-foreground">
                              Ref: {p.reference_no}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {inr(Number(p.amount ?? 0))}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                          {p.note || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredPayments.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-10 text-center text-xs text-muted-foreground"
                      >
                        No supplier payments recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ADD / EDIT VENDOR DIALOG */}
      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingVendorId ? "Edit Vendor" : "Add Vendor"}
            </DialogTitle>
            <DialogDescription>
              Store supplier contact, GSTIN, credit terms, and payout details.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveVendor} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="v-name">Supplier Name *</Label>
                <Input
                  id="v-name"
                  required
                  value={vName}
                  onChange={(e) => setVName(e.target.value)}
                  placeholder="Deccan Fresh Poultry"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-code">Vendor Code</Label>
                <Input
                  id="v-code"
                  value={vCode}
                  onChange={(e) => setVCode(e.target.value)}
                  placeholder="Auto (VND-001)"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select
                  value={vCategory}
                  onValueChange={(v) => setVCategory(v ?? "grocery")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VENDOR_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Payment Terms</Label>
                <Select
                  value={vTerms}
                  onValueChange={(v) => setVTerms(v ?? "cod")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VENDOR_PAYMENT_TERMS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select
                  value={vStatus}
                  onValueChange={(v) => setVStatus(v ?? "active")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="v-contact">Contact Person</Label>
                <Input
                  id="v-contact"
                  value={vContact}
                  onChange={(e) => setVContact(e.target.value)}
                  placeholder="Suresh Babu"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-phone">Phone Number</Label>
                <Input
                  id="v-phone"
                  value={vPhone}
                  onChange={(e) => setVPhone(e.target.value)}
                  placeholder="+91 98490 55443"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-email">Email</Label>
                <Input
                  id="v-email"
                  type="email"
                  value={vEmail}
                  onChange={(e) => setVEmail(e.target.value)}
                  placeholder="orders@supplier.in"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="v-gstin">GSTIN (optional)</Label>
                <Input
                  id="v-gstin"
                  value={vGstin}
                  onChange={(e) => setVGstin(e.target.value.toUpperCase())}
                  placeholder="36AABCU9603R1ZM"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-upi">UPI ID / Bank Account</Label>
                <Input
                  id="v-upi"
                  value={vUpi}
                  onChange={(e) => setVUpi(e.target.value)}
                  placeholder="supplier@okicici / SBI A/C"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="v-address">Address</Label>
                <Input
                  id="v-address"
                  value={vAddress}
                  onChange={(e) => setVAddress(e.target.value)}
                  placeholder="Begum Bazaar, Hyderabad"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-notes">Notes</Label>
                <Input
                  id="v-notes"
                  value={vNotes}
                  onChange={(e) => setVNotes(e.target.value)}
                  placeholder="Morning delivery window 6-8 AM"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setVendorDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Saving…"
                  : editingVendorId
                    ? "Save Vendor"
                    : "Create Vendor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* NEW PURCHASE ORDER DIALOG */}
      <Dialog open={poDialogOpen} onOpenChange={setPoDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Purchase Order</DialogTitle>
            <DialogDescription>
              Create a GST-calculated supplier order for raw materials or supplies.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreatePo} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Supplier *</Label>
                <Select
                  value={poVendorId}
                  onValueChange={(v) => setPoVendorId(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeVendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} ({v.vendor_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Outlet</Label>
                <Select
                  value={poOutletId}
                  onValueChange={(v) => setPoOutletId(v ?? "__all__")}
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
                <Label htmlFor="po-num">PO Number</Label>
                <Input
                  id="po-num"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="Auto (PO-YYYYMM-001)"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="po-date">Order Date *</Label>
                <Input
                  id="po-date"
                  type="date"
                  required
                  value={poOrderDate}
                  onChange={(e) => setPoOrderDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="po-exp">Expected Delivery</Label>
                <Input
                  id="po-exp"
                  type="date"
                  value={poExpectedDate}
                  onChange={(e) => setPoExpectedDate(e.target.value)}
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Line Items</span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    setPoLines((prev) => [...prev, { ...EMPTY_PO_LINE }])
                  }
                >
                  <Plus className="h-3 w-3" />
                  Add Row
                </Button>
              </div>

              <div className="space-y-2">
                {poLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="grid gap-2 sm:grid-cols-[1fr_70px_76px_96px_68px_32px]"
                  >
                    <Input
                      required
                      value={line.name}
                      onChange={(e) =>
                        setPoLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, name: e.target.value } : l,
                          ),
                        )
                      }
                      placeholder="Item (e.g. Basmati Rice)"
                      className="h-8 text-xs"
                    />
                    <Input
                      type="number"
                      min={0.01}
                      step="any"
                      required
                      value={line.qty}
                      onChange={(e) =>
                        setPoLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, qty: Number(e.target.value) } : l,
                          ),
                        )
                      }
                      placeholder="Qty"
                      className="h-8 text-xs tabular-nums"
                    />
                    <Input
                      value={line.unit}
                      onChange={(e) =>
                        setPoLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, unit: e.target.value } : l,
                          ),
                        )
                      }
                      placeholder="kg/L"
                      className="h-8 text-xs"
                    />
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      required
                      value={line.unit_cost}
                      onChange={(e) =>
                        setPoLines((prev) =>
                          prev.map((l, i) =>
                            i === idx
                              ? { ...l, unit_cost: Number(e.target.value) }
                              : l,
                          ),
                        )
                      }
                      placeholder="Rate ₹"
                      className="h-8 text-xs tabular-nums"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={28}
                      step="0.5"
                      value={line.gst_rate ?? 0}
                      onChange={(e) =>
                        setPoLines((prev) =>
                          prev.map((l, i) =>
                            i === idx
                              ? { ...l, gst_rate: Number(e.target.value) }
                              : l,
                          ),
                        )
                      }
                      placeholder="GST%"
                      className="h-8 text-xs tabular-nums"
                    />
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={poLines.length <= 1}
                      onClick={() =>
                        setPoLines((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Remove item row"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap justify-end gap-4 border-t border-border pt-2 text-xs tabular-nums">
                <span className="text-muted-foreground">
                  Subtotal: <strong>{inr(poPreviewTotals.subtotal)}</strong>
                </span>
                <span className="text-muted-foreground">
                  GST: <strong>{inr(poPreviewTotals.gstAmount)}</strong>
                </span>
                <span className="text-foreground">
                  Total: <strong>{inr(poPreviewTotals.totalAmount)}</strong>
                </span>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="po-notes">Notes (optional)</Label>
              <Input
                id="po-notes"
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                placeholder="Deliver to kitchen rear gate before 8 AM"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPoDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  pending || !poVendorId || poPreviewTotals.items.length === 0
                }
              >
                {pending ? "Creating…" : "Create Purchase Order"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* RECEIVE GOODS (GRN) DIALOG */}
      <Dialog
        open={Boolean(receivePo)}
        onOpenChange={(open) => !open && setReceivePo(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Receive Goods (GRN)</DialogTitle>
            <DialogDescription>
              {receivePo
                ? `Confirm delivery of ${receivePo.po_number} (${inr(
                    Number(receivePo.total_amount ?? 0),
                  )}).`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConfirmReceive} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="grn-inv">Supplier Invoice / Challan # (optional)</Label>
              <Input
                id="grn-inv"
                value={receiveInvoiceNo}
                onChange={(e) => setReceiveInvoiceNo(e.target.value)}
                placeholder="INV-2026-441"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReceivePo(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {pending ? "Updating…" : "Confirm Received"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* RECORD VENDOR PAYMENT DIALOG */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Vendor Payment</DialogTitle>
            <DialogDescription>
              Log a cash, UPI, or bank payout to update supplier balance.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordPayment} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Supplier *</Label>
              <Select
                value={payVendorId}
                onValueChange={(v) => {
                  setPayVendorId(v ?? "");
                  setPayPoId("__none__");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose supplier" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} ({v.vendor_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Apply to Purchase Order (optional)</Label>
              <Select
                value={payPoId}
                onValueChange={(v) => setPayPoId(v ?? "__none__")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">On Account (Unlinked)</SelectItem>
                  {openPosForSelectedVendor.map((po) => {
                    const rem = Math.max(
                      0,
                      Number(po.total_amount ?? 0) - Number(po.amount_paid ?? 0),
                    );
                    return (
                      <SelectItem key={po.id} value={po.id}>
                        {po.po_number} · Due {inr(rem)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="vp-amt">Amount (₹) *</Label>
                <Input
                  id="vp-amt"
                  type="number"
                  min={0.01}
                  step="any"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="4500"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vp-date">Payment Date *</Label>
                <Input
                  id="vp-date"
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Mode</Label>
                <Select
                  value={payMode}
                  onValueChange={(v) => setPayMode(v ?? "upi")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VENDOR_PAYMENT_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vp-ref">UTR / Cheque #</Label>
                <Input
                  id="vp-ref"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="UTR43109821"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="vp-note">Note (optional)</Label>
              <Input
                id="vp-note"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="Settled against weekly bill"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPayDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !payVendorId}>
                {pending ? "Recording…" : "Record Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
