"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Download,
  Printer,
  Search,
  X,
} from "lucide-react";
import { DEFAULT_TIME_ZONE } from "@/lib/time";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { updateOrderStatusAction } from "./[id]/actions";
import type { Order, OrderStatus, Outlet } from "@/lib/types";

type Props = {
  orders: Order[];
  outlets: Outlet[];
  restaurantSlug: string;
  outletFilter: string | null;
};

const ALL_VALUE = "__all__";
const ACTIVE_SET = new Set(["pending", "confirmed", "preparing", "ready"]);

const NEXT_STATUS: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  pending: { next: "confirmed", label: "Accept" },
  confirmed: { next: "preparing", label: "Cook" },
  preparing: { next: "ready", label: "Ready" },
  ready: { next: "completed", label: "Complete" },
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 ring-amber-500/20",
  confirmed: "bg-sky-500/10 text-sky-700 ring-sky-500/20",
  preparing: "bg-violet-500/10 text-violet-700 ring-violet-500/20",
  ready: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  completed: "bg-muted text-muted-foreground ring-border",
  cancelled: "bg-destructive/10 text-destructive ring-destructive/20",
};

type StatusTab = "all" | "active" | "pending" | "preparing" | "ready" | "completed" | "cancelled";

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "pending";
  const style = STATUS_STYLES[s] ?? "bg-muted text-muted-foreground ring-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset",
        style,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
      {s}
    </span>
  );
}

export function OrdersTable({
  orders,
  outlets,
  restaurantSlug,
  outletFilter,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [sourceFilter, setSourceFilter] = useState<string>(ALL_VALUE);
  const [typeFilter, setTypeFilter] = useState<string>(ALL_VALUE);

  const outletById = useMemo(
    () => new Map(outlets.map((o) => [o.id, o])),
    [outlets],
  );

  const distinctSources = useMemo(
    () => Array.from(new Set(orders.map((o) => o.source))).sort(),
    [orders],
  );

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = {
      all: orders.length,
      active: 0,
      pending: 0,
      preparing: 0,
      ready: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const o of orders) {
      const s = o.status ?? "pending";
      if (ACTIVE_SET.has(s)) c.active++;
      if (s === "pending" || s === "confirmed") c.pending++;
      else if (s === "preparing") c.preparing++;
      else if (s === "ready") c.ready++;
      else if (s === "completed") c.completed++;
      else if (s === "cancelled") c.cancelled++;
    }
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const s = o.status ?? "pending";
      if (statusTab === "active" && !ACTIVE_SET.has(s)) return false;
      if (statusTab === "pending" && s !== "pending" && s !== "confirmed")
        return false;
      if (statusTab === "preparing" && s !== "preparing") return false;
      if (statusTab === "ready" && s !== "ready") return false;
      if (statusTab === "completed" && s !== "completed") return false;
      if (statusTab === "cancelled" && s !== "cancelled") return false;

      if (sourceFilter !== ALL_VALUE && o.source !== sourceFilter) return false;
      if (
        typeFilter !== ALL_VALUE &&
        (o.order_type ?? "").toLowerCase() !== typeFilter
      )
        return false;

      if (!q) return true;
      return (
        (o.unique_order_id ?? "").toLowerCase().includes(q) ||
        String(o.token_number ?? "").includes(q) ||
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        (o.customer_email ?? "").toLowerCase().includes(q)
      );
    });
  }, [orders, statusTab, sourceFilter, typeFilter, search]);

  const onOutletChange = (v: string | null) => {
    const url =
      !v || v === ALL_VALUE
        ? `/r/${restaurantSlug}/admin/orders`
        : `/r/${restaurantSlug}/admin/orders?outlet=${v}`;
    router.push(url);
  };

  const quickAdvance = (orderId: string, nextStatus: OrderStatus) => {
    setBusyId(orderId);
    startTransition(async () => {
      const res = await updateOrderStatusAction(
        restaurantSlug,
        orderId,
        nextStatus,
      );
      if (!res.ok) alert(res.error);
      else router.refresh();
      setBusyId(null);
    });
  };

  const exportCsv = () => {
    const headers = [
      "Order ID",
      "Token",
      "Customer",
      "Email",
      "Type",
      "Source",
      "Status",
      "Subtotal",
      "CGST",
      "SGST",
      "Total",
      "Placed At",
    ];
    const rows = filtered.map((o) => [
      o.unique_order_id ?? o.id,
      o.token_number ?? "",
      `"${(o.customer_name ?? "").replace(/"/g, '""')}"`,
      `"${(o.customer_email ?? "").replace(/"/g, '""')}"`,
      o.order_type ?? "",
      o.source ?? "",
      o.status ?? "",
      o.subtotal ?? 0,
      o.cgst_amount ?? 0,
      o.sgst_amount ?? 0,
      o.total_amount ?? 0,
      o.placed_at ?? o.created_at ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${restaurantSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusTabs: { key: StatusTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "pending", label: "New / Accepted" },
    { key: "preparing", label: "Preparing" },
    { key: "ready", label: "Ready" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <Card>
      <CardHeader className="space-y-3 border-b border-border/60 pb-3">
        {/* Status filter pills */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-[10px] bg-muted p-0.5">
            {statusTabs.map((t) => {
              const active = statusTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setStatusTab(t.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                    active
                      ? "bg-card text-foreground shadow-control"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{t.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1 text-[11px] tabular-nums",
                      active
                        ? "bg-muted text-foreground"
                        : "bg-card/60 text-muted-foreground",
                    )}
                  >
                    {counts[t.key]}
                  </span>
                </button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="h-8 text-xs"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV ({filtered.length})
          </Button>
        </div>

        {/* Search & secondary filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order ID, token #, customer…"
              className="h-8 pl-8 text-xs"
            />
          </div>

          <Select
            value={sourceFilter}
            onValueChange={(v) => v && setSourceFilter(v)}
          >
            <SelectTrigger size="sm" className="w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All sources</SelectItem>
              {distinctSources.map((src) => (
                <SelectItem key={src} value={src}>
                  {src.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={typeFilter}
            onValueChange={(v) => v && setTypeFilter(v)}
          >
            <SelectTrigger size="sm" className="w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All order types</SelectItem>
              <SelectItem value="dine-in">Dine-in</SelectItem>
              <SelectItem value="takeaway">Takeaway</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
            </SelectContent>
          </Select>

          {outlets.length > 1 && (
            <Select
              value={outletFilter ? String(outletFilter) : ALL_VALUE}
              onValueChange={onOutletChange}
            >
              <SelectTrigger size="sm" className="w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All outlets</SelectItem>
                {outlets.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(search ||
            statusTab !== "all" ||
            sourceFilter !== ALL_VALUE ||
            typeFilter !== ALL_VALUE) && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setSearch("");
                setStatusTab("all");
                setSourceFilter(ALL_VALUE);
                setTypeFilter(ALL_VALUE);
              }}
            >
              <X className="mr-1 h-3 w-3" /> Reset
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="pl-4">Order</TableHead>
              <TableHead>Customer</TableHead>
              {outlets.length > 1 && <TableHead>Outlet</TableHead>}
              <TableHead>Type / Source</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Placed</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => {
              const outlet = outletById.get(o.outlet_id);
              const detailHref = `/r/${restaurantSlug}/admin/orders/${o.id}`;
              const receiptHref = `/r/${restaurantSlug}/pos/receipt/${o.id}`;
              const status = (o.status ?? "pending") as OrderStatus;
              const nextAction = NEXT_STATUS[status];

              return (
                <TableRow
                  key={o.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => router.push(detailHref)}
                >
                  <TableCell className="pl-4 tabular-nums text-xs">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={detailHref}
                        className="font-medium text-foreground hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {o.unique_order_id ?? o.id.slice(0, 8)}
                      </Link>
                      {o.token_number != null && (
                        <Badge variant="secondary" className="h-4 px-1 text-[11px]">
                          #{o.token_number}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-medium">{o.customer_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {o.customer_email}
                    </div>
                  </TableCell>
                  {outlets.length > 1 && (
                    <TableCell className="text-xs text-muted-foreground">
                      {outlet?.name ?? `#${o.outlet_id}`}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[11px] uppercase">
                        {o.source}
                      </Badge>
                      <span className="text-xs capitalize text-muted-foreground">
                        {o.order_type}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    ₹{Number(o.total_amount).toFixed(0)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {o.created_at
                      ? new Date(o.created_at).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: DEFAULT_TIME_ZONE,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell
                    className="pr-4 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex items-center justify-end gap-1">
                      {nextAction && (
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={pending && busyId === o.id}
                          onClick={() => quickAdvance(o.id, nextAction.next)}
                        >
                          {nextAction.label}
                          <ArrowRight className="ml-0.5 h-2.5 w-2.5" />
                        </Button>
                      )}
                      <Link
                        href={receiptHref}
                        target="_blank"
                        title="Print thermal receipt"
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "icon-xs" }),
                        )}
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={outlets.length > 1 ? 8 : 7}
                  className="py-10 text-center text-xs text-muted-foreground"
                >
                  No orders match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
