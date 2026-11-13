"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  Ellipsis,
  LayoutGrid,
  LayoutTemplate,
  MonitorSmartphone,
  Plus,
  Printer,
  Rows3,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { parseTableName, type OutletInfo, type RawPosTab } from "@/lib/tables";
import {
  applyCapacityPresetAction,
  bulkCreateTableRangeAction,
  clearEmptyZoneTablesAction,
  clearTableTabAction,
  createFloorTableAction,
  deleteFloorTableAction,
  type CapacityPresetId,
} from "./actions";

// Kept here too so existing imports from this module keep working.
export { parseTableName };
export type { OutletInfo, RawPosTab };

export type ActiveTableOrder = {
  id: string;
  outlet_id: string;
  unique_order_id: string | null;
  token_number: number | null;
  status: string | null;
  customer_name: string;
  instructions: string | null;
  total_amount: number;
  placed_at: string;
  item_summary: string[];
};

type ParsedTable = {
  id: string;
  outletId: string;
  rawName: string;
  code: string;
  zone: string;
  seats: number;
  cartLines: Array<{ name: string; qty: number; total: number }>;
  cartTotal: number;
  cartQty: number;
  activeOrders: ActiveTableOrder[];
  orderTotal: number;
  updatedAt: string;
};

type TableStatus = "free" | "open" | "kitchen" | "ready";

const STATUS_META: Record<
  TableStatus,
  { label: string; dot: string; tile: string; text: string }
> = {
  free: {
    label: "Free",
    dot: "bg-muted-foreground/40",
    tile: "border-border bg-card hover:border-foreground/25",
    text: "text-muted-foreground",
  },
  open: {
    label: "Open bill",
    dot: "bg-amber-500",
    tile: "border-amber-300 bg-amber-50 hover:border-amber-400 dark:border-amber-500/40 dark:bg-amber-500/10",
    text: "text-amber-800 dark:text-amber-300",
  },
  kitchen: {
    label: "In kitchen",
    dot: "bg-violet-500",
    tile: "border-violet-300 bg-violet-50 hover:border-violet-400 dark:border-violet-500/40 dark:bg-violet-500/10",
    text: "text-violet-800 dark:text-violet-300",
  },
  ready: {
    label: "Ready to serve",
    dot: "bg-emerald-500",
    tile: "border-emerald-300 bg-emerald-50 hover:border-emerald-400 dark:border-emerald-500/40 dark:bg-emerald-500/10",
    text: "text-emerald-800 dark:text-emerald-300",
  },
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "New",
  confirmed: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
};

const TEMPLATES: {
  id: CapacityPresetId;
  name: string;
  summary: string;
  blurb: string;
  areas: { name: string; detail: string }[];
}[] = [
  {
    id: "12-table",
    name: "Café",
    summary: "12 tables · 56 seats",
    blurb: "Coffee shops, quick-service counters and small bistros.",
    areas: [
      { name: "Main Hall", detail: "8 tables, 2 to 6 seats" },
      { name: "Family AC", detail: "2 tables of 6" },
      { name: "VIP Cabin", detail: "2 tables of 8" },
    ],
  },
  {
    id: "300-seat",
    name: "Restaurant",
    summary: "65 tables · 300 seats",
    blurb: "Full-service dining rooms and meals halls.",
    areas: [
      { name: "Ground Main Hall", detail: "30 tables of 4" },
      { name: "1st Floor Family AC", detail: "20 tables of 4" },
      { name: "Group & Bhojanam Hall", detail: "10 tables of 6" },
      { name: "Banquet & VIP Cabins", detail: "5 tables of 8" },
    ],
  },
  {
    id: "3000-seat",
    name: "Banquet hall",
    summary: "500 tables · 3,000 seats",
    blurb: "Convention dining, food courts and multi-floor banquets.",
    areas: [
      { name: "Halls A, B, C and D", detail: "100 tables of 6 each" },
      { name: "Grand Banquet & Lawn", detail: "100 tables of 6" },
    ],
  },
];

function matchesTableOrder(code: string, order: ActiveTableOrder): boolean {
  const hay = `${order.customer_name ?? ""} ${order.instructions ?? ""}`.toLowerCase();
  const needle = code.toLowerCase().trim();
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  const numMatch = needle.match(/(\d+)/);
  if (numMatch && (needle.startsWith("table") || needle.startsWith("t-"))) {
    const n = Number(numMatch[1]);
    const padded = String(n).padStart(2, "0");
    if (
      hay.includes(`table ${n}`) ||
      hay.includes(`table ${padded}`) ||
      hay.includes(`t-${n}`) ||
      hay.includes(`t-${padded}`)
    ) {
      return true;
    }
  }
  return false;
}

function tableStatus(t: ParsedTable): TableStatus {
  if (t.activeOrders.some((o) => o.status === "ready")) return "ready";
  if (t.activeOrders.length > 0) return "kitchen";
  if (t.cartQty > 0) return "open";
  return "free";
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (n: number) => n.toLocaleString("en-IN");

function elapsed(iso: string): string {
  const mins = Math.max(
    1,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

// Mirrors bulkCreateTableRangeAction so the preview matches what gets created.
function rangeCode(prefix: string, n: number, end: number) {
  const clean = (prefix || "T-").trim();
  const sep = clean.endsWith("-") || clean.endsWith(" ") ? "" : "-";
  return `${clean}${sep}${String(n).padStart(end >= 100 ? 3 : 2, "0")}`;
}

type DialogKind = "single" | "bulk" | "template" | null;
type StatusFilter = "all" | "occupied" | "free";

export function TableFloorBoard({
  slug,
  outlets,
  tabs,
  activeOrders,
  todayDineInCount,
  todayDineInRevenue,
}: {
  slug: string;
  outlets: OutletInfo[];
  tabs: RawPosTab[];
  activeOrders: ActiveTableOrder[];
  todayDineInCount: number;
  todayDineInRevenue: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedOutletId, setSelectedOutletId] = useState<string>(
    outlets[0]?.id ?? "",
  );
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newZone, setNewZone] = useState("Ground Main Hall");
  const [newSeats, setNewSeats] = useState("4");
  const [bulkPrefix, setBulkPrefix] = useState("T");
  const [bulkStart, setBulkStart] = useState("1");
  const [bulkEnd, setBulkEnd] = useState("20");
  const [bulkZone, setBulkZone] = useState("Ground Main Hall");
  const [bulkSeats, setBulkSeats] = useState("4");
  const [templateId, setTemplateId] = useState<CapacityPresetId>("300-seat");

  // The id stays set while the panel animates closed, so its content doesn't
  // blank out mid-slide; `detailsOpen` alone drives visibility.
  const [inspectedTableId, setInspectedTableId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirming, setConfirming] = useState<"clear" | "remove" | null>(null);
  const [removeArea, setRemoveArea] = useState<{ zone: string; count: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const outlet = outlets.find((o) => o.id === selectedOutletId) ?? null;

  const parsedTables: ParsedTable[] = useMemo(() => {
    const outletOrders = activeOrders.filter(
      (o) => o.outlet_id === selectedOutletId,
    );
    return tabs
      .filter((t) => t.outlet_id === selectedOutletId)
      .map((t) => {
        const { code, zone, seats } = parseTableName(t.name);
        const cartLines = (Array.isArray(t.lines) ? t.lines : []).map((l) => {
          const qty = Number(l.qty ?? 1);
          return {
            name: l.product?.name ?? "Item",
            qty,
            total: qty * Number(l.unitPrice ?? 0),
          };
        });
        const matchedOrders = outletOrders.filter((o) =>
          matchesTableOrder(code, o),
        );
        return {
          id: t.id,
          outletId: t.outlet_id,
          rawName: t.name,
          code,
          zone,
          seats,
          cartLines,
          cartTotal: cartLines.reduce((s, l) => s + l.total, 0),
          cartQty: cartLines.reduce((s, l) => s + l.qty, 0),
          activeOrders: matchedOrders,
          orderTotal: matchedOrders.reduce((s, o) => s + Number(o.total_amount), 0),
          updatedAt: t.updated_at,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [tabs, activeOrders, selectedOutletId]);

  const zoneStats = useMemo(() => {
    const map = new Map<
      string,
      { zone: string; tables: number; seats: number; occupied: number; value: number; emptyBills: number }
    >();
    for (const t of parsedTables) {
      const cur = map.get(t.zone) ?? {
        zone: t.zone,
        tables: 0,
        seats: 0,
        occupied: 0,
        value: 0,
        emptyBills: 0,
      };
      cur.tables += 1;
      cur.seats += t.seats;
      if (tableStatus(t) !== "free") {
        cur.occupied += 1;
        cur.value += t.cartTotal + t.orderTotal;
      }
      // The server removes tables whose bill has no items.
      if (t.cartLines.length === 0) cur.emptyBills += 1;
      map.set(t.zone, cur);
    }
    return Array.from(map.values());
  }, [parsedTables]);

  const filteredTables = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return parsedTables.filter((t) => {
      if (selectedZone !== "all" && t.zone !== selectedZone) return false;
      const isOccupied = tableStatus(t) !== "free";
      if (statusFilter === "occupied" && !isOccupied) return false;
      if (statusFilter === "free" && isOccupied) return false;
      if (!q) return true;
      return (
        t.code.toLowerCase().includes(q) ||
        t.zone.toLowerCase().includes(q) ||
        t.activeOrders.some(
          (o) =>
            (o.customer_name ?? "").toLowerCase().includes(q) ||
            String(o.token_number ?? "").includes(q),
        )
      );
    });
  }, [parsedTables, selectedZone, statusFilter, searchQuery]);

  const sections = useMemo(() => {
    const byZone = new Map<string, ParsedTable[]>();
    for (const t of filteredTables) {
      const list = byZone.get(t.zone) ?? [];
      list.push(t);
      byZone.set(t.zone, list);
    }
    return zoneStats
      .filter((z) => byZone.has(z.zone))
      .map((z) => ({ stat: z, tables: byZone.get(z.zone)! }));
  }, [filteredTables, zoneStats]);

  const totalTables = parsedTables.length;
  const occupied = parsedTables.filter((t) => tableStatus(t) !== "free");
  const occupiedTables = occupied.length;
  const freeTables = totalTables - occupiedTables;
  const totalSeats = parsedTables.reduce((s, t) => s + t.seats, 0);
  const occupiedSeats = occupied.reduce((s, t) => s + t.seats, 0);
  const runningValue = occupied.reduce((s, t) => s + t.cartTotal + t.orderTotal, 0);
  const occupancyPct = totalTables ? Math.round((occupiedTables / totalTables) * 100) : 0;
  const filtersActive =
    statusFilter !== "all" || selectedZone !== "all" || searchQuery.trim() !== "";

  const inspected = useMemo(
    () => parsedTables.find((t) => t.id === inspectedTableId) ?? null,
    [parsedTables, inspectedTableId],
  );

  function resetFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setSelectedZone("all");
  }

  function openDialog(kind: Exclude<DialogKind, null>) {
    setDialogError(null);
    setDialog(kind);
  }

  function openTable(id: string) {
    setConfirming(null);
    setInspectedTableId(id);
    setDetailsOpen(true);
  }

  function done(message: string) {
    setError(null);
    setNotice(message);
    router.refresh();
  }

  function handleAddSingleTable(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim() || !selectedOutletId) return;
    setDialogError(null);
    startTransition(async () => {
      const res = await createFloorTableAction(
        slug,
        selectedOutletId,
        newCode,
        newZone,
        Number(newSeats) || 4,
      );
      if (!res.ok) return setDialogError(res.error);
      setDialog(null);
      done(`Added ${newCode.trim()} to ${newZone.trim() || "the floor"}.`);
      setNewCode("");
    });
  }

  function handleBulkGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOutletId) return;
    setDialogError(null);
    const startNum = Math.max(1, Number(bulkStart) || 1);
    const endNum = Math.max(startNum, Number(bulkEnd) || startNum);
    const seats = Math.max(1, Number(bulkSeats) || 4);
    startTransition(async () => {
      const res = await bulkCreateTableRangeAction(slug, selectedOutletId, {
        prefix: bulkPrefix,
        startNum,
        endNum,
        zone: bulkZone,
        seats,
      });
      if (!res.ok) return setDialogError(res.error);
      setDialog(null);
      done(
        res.created > 0
          ? `Added ${res.created} tables to ${bulkZone.trim()}.`
          : "Those table names already exist, so nothing was added.",
      );
    });
  }

  function handleApplyTemplate() {
    if (!selectedOutletId) return;
    const template = TEMPLATES.find((t) => t.id === templateId)!;
    setDialogError(null);
    startTransition(async () => {
      const res = await applyCapacityPresetAction(slug, selectedOutletId, templateId, true);
      if (!res.ok) return setDialogError(res.error);
      setDialog(null);
      resetFilters();
      done(`Applied the ${template.name.toLowerCase()} template: ${res.created} tables added.`);
    });
  }

  function handleRemoveArea() {
    if (!removeArea || !selectedOutletId) return;
    const { zone } = removeArea;
    startTransition(async () => {
      const res = await clearEmptyZoneTablesAction(slug, selectedOutletId, zone);
      setRemoveArea(null);
      if (!res.ok) return setError(res.error);
      if (selectedZone === zone) setSelectedZone("all");
      done(`Removed ${res.deleted} empty tables from ${zone}.`);
    });
  }

  function handleClearBill(t: ParsedTable) {
    startTransition(async () => {
      const res = await clearTableTabAction(slug, t.id);
      setConfirming(null);
      if (!res.ok) return setError(res.error);
      done(`Cleared the open bill on ${t.code}.`);
    });
  }

  function handleRemoveTable(t: ParsedTable) {
    startTransition(async () => {
      const res = await deleteFloorTableAction(slug, t.id);
      setConfirming(null);
      if (!res.ok) return setError(res.error);
      setDetailsOpen(false);
      done(`Removed ${t.code} from the floor.`);
    });
  }

  async function copyQrLink(t: ParsedTable) {
    const url = `${window.location.origin}/r/${slug}?table=${encodeURIComponent(t.code)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(t.id);
      setTimeout(() => setCopiedId((c) => (c === t.id ? null : c)), 1800);
    } catch {
      setError("Couldn't copy the link. Your browser blocked clipboard access.");
    }
  }

  const bulkFrom = Math.max(1, Number(bulkStart) || 1);
  const bulkTo = Math.max(bulkFrom, Number(bulkEnd) || bulkFrom);
  const bulkCount = bulkTo - bulkFrom + 1;
  const bulkSeatTotal = bulkCount * Math.max(1, Number(bulkSeats) || 4);
  const zoneNames = zoneStats.map((z) => z.zone);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tables & Floor"
        description={
          outlets.length > 1
            ? "Who's seated, what's on their bill, and your floor layout."
            : outlet
              ? `${outlet.name}${outlet.city ? `, ${outlet.city}` : ""}`
              : undefined
        }
        actions={
          <>
            {outlets.length > 1 && (
              <Select
                value={selectedOutletId}
                onValueChange={(v) => {
                  if (!v) return;
                  setSelectedOutletId(v);
                  setSelectedZone("all");
                  setDetailsOpen(false);
                }}
              >
                <SelectTrigger size="sm" className="w-52">
                  <SelectValue>
                    {(v: string) => outlets.find((o) => o.id === v)?.name ?? "Outlet"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Link
              href={`/r/${slug}/admin/tables/qr-sheet`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Printer /> Print QR codes
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button size="sm" disabled={pending || !selectedOutletId} />}
              >
                <Plus /> Add tables <ChevronDown className="opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onClick={() => openDialog("single")}>
                  <Plus /> One table
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openDialog("bulk")}>
                  <Rows3 /> A numbered range
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openDialog("template")}>
                  <LayoutTemplate /> From a floor template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {(error || notice) && (
        <div
          role={error ? "alert" : "status"}
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-xs",
            error
              ? "bg-destructive/10 text-destructive"
              : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
          )}
        >
          <span>{error ?? notice}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
            className="opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {totalTables === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={LayoutGrid}
            title="No tables yet"
            description="Add tables one at a time, as a numbered range, or start from a ready-made floor and adjust it later."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => openDialog("template")}>
                  <LayoutTemplate /> Start from a template
                </Button>
                <Button size="sm" variant="outline" onClick={() => openDialog("single")}>
                  <Plus /> Add one table
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
            <Stat label="Occupied" value={num(occupiedTables)} suffix={`of ${num(totalTables)} tables`}>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-[width]"
                  style={{ width: `${occupancyPct}%` }}
                />
              </div>
            </Stat>
            <Stat
              label="Seats in use"
              value={num(occupiedSeats)}
              suffix={`of ${num(totalSeats)}`}
              hint={`${num(freeTables)} tables free`}
            />
            <Stat
              label="On tables now"
              value={inr(runningValue)}
              hint="Open bills and kitchen orders"
            />
            <Stat
              label="Dine-in today"
              value={inr(todayDineInRevenue)}
              hint={
                todayDineInCount > 0
                  ? `${todayDineInCount} ${todayDineInCount === 1 ? "bill" : "bills"} · avg ${inr(todayDineInRevenue / todayDineInCount)}`
                  : "No dine-in bills yet"
              }
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find a table, guest or token"
                aria-label="Find a table"
                className="h-8 pl-8 text-xs"
              />
            </div>

            <div className="flex items-center rounded-lg bg-muted p-0.5 text-xs">
              {(
                [
                  { id: "all", label: "All", count: totalTables },
                  { id: "occupied", label: "Occupied", count: occupiedTables },
                  { id: "free", label: "Free", count: freeTables },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={statusFilter === f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md px-3 font-medium transition-colors",
                    statusFilter === f.id
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                  <span className="tabular-nums text-muted-foreground">{num(f.count)}</span>
                </button>
              ))}
            </div>

            {zoneStats.length > 1 && (
              <Select
                value={selectedZone}
                onValueChange={(v) => v && setSelectedZone(v)}
              >
                <SelectTrigger size="sm" className="h-8 min-w-40 text-xs">
                  <SelectValue>
                    {(v: string) => (v === "all" ? "All areas" : v)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All areas</SelectItem>
                  {zoneNames.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="ml-auto hidden items-center gap-4 text-xs text-muted-foreground lg:flex">
              {(["open", "kitchen", "ready"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", STATUS_META[s].dot)} />
                  {STATUS_META[s].label}
                </span>
              ))}
            </div>
          </div>

          {/* Floor */}
          {sections.length === 0 ? (
            <div className="rounded-xl border border-border bg-card">
              <EmptyState
                icon={SearchX}
                title="No tables match"
                description="Try a different search, or show every table again."
                action={
                  <Button size="sm" variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="space-y-8">
              {sections.map(({ stat, tables: list }) => (
                <section key={stat.zone} aria-label={stat.zone}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-baseline gap-2.5">
                      <h2 className="truncate text-sm font-semibold">{stat.zone}</h2>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {num(stat.tables)} tables · {num(stat.seats)} seats
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {stat.occupied > 0 && (
                        <span className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{stat.occupied}</span>{" "}
                          occupied · {inr(stat.value)}
                        </span>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`${stat.zone} options`}
                              className="text-muted-foreground"
                            />
                          }
                        >
                          <Ellipsis />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          <DropdownMenuItem
                            onClick={() => {
                              setBulkZone(stat.zone);
                              openDialog("bulk");
                            }}
                          >
                            <Plus /> Add tables to this area
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={stat.emptyBills === 0}
                            onClick={() =>
                              setRemoveArea({ zone: stat.zone, count: stat.emptyBills })
                            }
                          >
                            Remove empty tables
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
                    {list.map((t) => (
                      <TableTile key={t.id} table={t} onOpen={() => openTable(t.id)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* Table details */}
      <Sheet
        open={detailsOpen && inspected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsOpen(false);
            setConfirming(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          {inspected && (
            <TableDetails
              table={inspected}
              slug={slug}
              pending={pending}
              copied={copiedId === inspected.id}
              confirming={confirming}
              onConfirm={setConfirming}
              onCopy={() => copyQrLink(inspected)}
              onClearBill={() => handleClearBill(inspected)}
              onRemove={() => handleRemoveTable(inspected)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Add one table */}
      <Dialog open={dialog === "single"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a table</DialogTitle>
            <DialogDescription>
              It shows up in the POS right away and gets its own QR ordering link.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSingleTable} className="grid gap-4">
            <Field label="Table name" htmlFor="tbl-code">
              <Input
                id="tbl-code"
                placeholder="T-31"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <Field label="Area" htmlFor="tbl-zone">
                <Input
                  id="tbl-zone"
                  list="table-areas"
                  value={newZone}
                  onChange={(e) => setNewZone(e.target.value)}
                />
              </Field>
              <Field label="Seats" htmlFor="tbl-seats">
                <Input
                  id="tbl-seats"
                  type="number"
                  min={1}
                  max={50}
                  value={newSeats}
                  onChange={(e) => setNewSeats(e.target.value)}
                />
              </Field>
            </div>
            <DialogError message={dialogError} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !newCode.trim()}>
                {pending ? "Adding…" : "Add table"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add a numbered range */}
      <Dialog open={dialog === "bulk"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a range of tables</DialogTitle>
            <DialogDescription>
              Number a whole area at once. Names that already exist are skipped.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBulkGenerate} className="grid gap-4">
            <Field label="Area" htmlFor="bulk-zone">
              <Input
                id="bulk-zone"
                list="table-areas"
                placeholder="2nd Floor Banquet"
                value={bulkZone}
                onChange={(e) => setBulkZone(e.target.value)}
                required
              />
            </Field>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Prefix" htmlFor="bulk-prefix">
                <Input
                  id="bulk-prefix"
                  value={bulkPrefix}
                  onChange={(e) => setBulkPrefix(e.target.value)}
                  required
                />
              </Field>
              <Field label="From" htmlFor="bulk-start">
                <Input
                  id="bulk-start"
                  type="number"
                  min={1}
                  max={5000}
                  value={bulkStart}
                  onChange={(e) => setBulkStart(e.target.value)}
                  required
                />
              </Field>
              <Field label="To" htmlFor="bulk-end">
                <Input
                  id="bulk-end"
                  type="number"
                  min={1}
                  max={5000}
                  value={bulkEnd}
                  onChange={(e) => setBulkEnd(e.target.value)}
                  required
                />
              </Field>
              <Field label="Seats" htmlFor="bulk-seats">
                <Input
                  id="bulk-seats"
                  type="number"
                  min={1}
                  max={50}
                  value={bulkSeats}
                  onChange={(e) => setBulkSeats(e.target.value)}
                  required
                />
              </Field>
            </div>
            <p className="rounded-lg bg-muted px-3.5 py-2.5 text-xs text-muted-foreground">
              Creates{" "}
              <span className="font-medium text-foreground">
                {rangeCode(bulkPrefix, bulkFrom, bulkTo)}
                {bulkCount > 1 && ` to ${rangeCode(bulkPrefix, bulkTo, bulkTo)}`}
              </span>
              : {num(bulkCount)} {bulkCount === 1 ? "table" : "tables"},{" "}
              {num(bulkSeatTotal)} seats.
              {bulkCount > 600 && " That's more than 600, so split it into smaller ranges."}
            </p>
            <DialogError message={dialogError} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || bulkCount > 600}>
                {pending ? "Adding…" : `Add ${num(bulkCount)} tables`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Floor templates */}
      <Dialog open={dialog === "template"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Start from a floor template</DialogTitle>
            <DialogDescription>
              Pick the layout closest to yours. You can rename, add or remove
              tables afterwards.
            </DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="Floor template" className="grid gap-3 sm:grid-cols-3">
            {TEMPLATES.map((tpl) => {
              const selected = tpl.id === templateId;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${tpl.name}, ${tpl.summary}`}
                  onClick={() => setTemplateId(tpl.id)}
                  className={cn(
                    "flex flex-col rounded-xl border p-4 text-left transition-colors",
                    selected
                      ? "border-foreground ring-1 ring-foreground"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{tpl.name}</span>
                    <span
                      className={cn(
                        "grid h-4 w-4 place-items-center rounded-full border",
                        selected ? "border-foreground bg-foreground text-background" : "border-border",
                      )}
                    >
                      {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                  </div>
                  <span className="mt-0.5 text-xs font-medium text-foreground/80">
                    {tpl.summary}
                  </span>
                  <span className="mt-2 text-xs text-muted-foreground">{tpl.blurb}</span>
                  <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
                    {tpl.areas.map((a) => (
                      <div key={a.name}>
                        <dt className="font-medium">{a.name}</dt>
                        <dd className="text-muted-foreground">{a.detail}</dd>
                      </div>
                    ))}
                  </dl>
                </button>
              );
            })}
          </div>
          <p className="rounded-lg bg-muted px-3.5 py-2.5 text-xs text-muted-foreground">
            Tables on {outlet?.name ?? "this outlet"} with no items on their bill
            are replaced. Tables with an open bill are kept.
          </p>
          <DialogError message={dialogError} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleApplyTemplate} disabled={pending}>
              {pending
                ? "Applying…"
                : `Use ${TEMPLATES.find((t) => t.id === templateId)!.name.toLowerCase()} layout`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm area removal */}
      <Dialog open={removeArea !== null} onOpenChange={(o) => !o && setRemoveArea(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove empty tables?</DialogTitle>
            <DialogDescription>
              {removeArea &&
                `${num(removeArea.count)} ${removeArea.count === 1 ? "table" : "tables"} in ${removeArea.zone} with nothing on the bill will be deleted, along with their QR links. Tables with an open bill stay.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRemoveArea(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleRemoveArea} disabled={pending}>
              {pending ? "Removing…" : "Remove tables"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <datalist id="table-areas">
        {zoneNames.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  hint,
  children,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      {children}
    </div>
  );
}

function TableTile({ table: t, onOpen }: { table: ParsedTable; onOpen: () => void }) {
  const status = tableStatus(t);
  const meta = STATUS_META[status];
  const oldest = t.activeOrders.reduce<string | null>(
    (min, o) => (!min || o.placed_at < min ? o.placed_at : min),
    null,
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${t.code}, ${meta.label}`}
      className={cn(
        "flex h-[72px] flex-col justify-between rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
        meta.tile,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{t.code}</span>
        {status !== "free" && <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />}
      </div>
      {status === "free" ? (
        <span className="text-xs text-muted-foreground">{t.seats} seats</span>
      ) : (
        <div className={cn("flex items-baseline justify-between gap-2 text-xs", meta.text)}>
          <span className="font-semibold tabular-nums">{inr(t.cartTotal + t.orderTotal)}</span>
          <span className="truncate opacity-80" suppressHydrationWarning>
            {oldest ? elapsed(oldest) : `${t.cartQty} ${t.cartQty === 1 ? "item" : "items"}`}
          </span>
        </div>
      )}
    </button>
  );
}

function TableDetails({
  table: t,
  slug,
  pending,
  copied,
  confirming,
  onConfirm,
  onCopy,
  onClearBill,
  onRemove,
}: {
  table: ParsedTable;
  slug: string;
  pending: boolean;
  copied: boolean;
  confirming: "clear" | "remove" | null;
  onConfirm: (c: "clear" | "remove" | null) => void;
  onCopy: () => void;
  onClearBill: () => void;
  onRemove: () => void;
}) {
  const status = tableStatus(t);
  const meta = STATUS_META[status];
  const hasCart = t.cartQty > 0;
  const total = t.cartTotal + t.orderTotal;

  return (
    <>
      <SheetHeader className="border-b border-border">
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.text)}>
          <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
          {meta.label}
        </span>
        <SheetTitle className="text-xl">{t.code}</SheetTitle>
        <SheetDescription>
          {t.zone} · {t.seats} seats
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {status === "free" ? (
          <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
            Nobody is seated here. Open it in the POS to start a bill.
          </p>
        ) : (
          <>
            {t.activeOrders.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground">Kitchen orders</h3>
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {t.activeOrders.map((o) => (
                    <li key={o.id} className="px-3.5 py-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <Link
                          href={`/r/${slug}/admin/orders/${o.id}`}
                          className="font-medium hover:underline"
                        >
                          Token {o.token_number ?? o.unique_order_id?.slice(-4) ?? "—"}
                        </Link>
                        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                          {ORDER_STATUS_LABEL[o.status ?? ""] ?? o.status}
                          <span className="inline-flex items-center gap-1" suppressHydrationWarning>
                            <Clock className="h-3 w-3" />
                            {elapsed(o.placed_at)}
                          </span>
                        </span>
                      </div>
                      {o.item_summary.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {o.item_summary.join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hasCart && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground">On the open bill</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {t.cartLines.map((l, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="tabular-nums text-muted-foreground">{l.qty}×</span>{" "}
                        {l.name}
                      </span>
                      <span className="shrink-0 tabular-nums">{inr(l.total)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex items-baseline justify-between border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">Total so far</span>
              <span className="text-xl font-semibold tabular-nums">{inr(total)}</span>
            </div>
          </>
        )}
      </div>

      <SheetFooter className="border-t border-border">
        {confirming ? (
          <div className="space-y-3">
            <p className="text-sm">
              {confirming === "clear"
                ? `Clear ${t.cartQty} ${t.cartQty === 1 ? "item" : "items"} from ${t.code}'s bill? This can't be undone.`
                : `Remove ${t.code} from the floor? Its QR link will stop working.`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => onConfirm(null)} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirming === "clear" ? onClearBill : onRemove}
                disabled={pending}
              >
                {confirming === "clear" ? "Clear bill" : "Remove table"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Link
              href={`/r/${slug}/pos?table=${encodeURIComponent(t.rawName)}`}
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              <MonitorSmartphone />
              {hasCart ? "Resume bill in POS" : "Open in POS"}
            </Link>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onCopy}>
                {copied ? <Check className="text-emerald-600" /> : <Copy />}
                {copied ? "Link copied" : "Copy QR link"}
              </Button>
              {hasCart ? (
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onConfirm("clear")}
                >
                  Clear bill
                </Button>
              ) : t.activeOrders.length === 0 ? (
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onConfirm("remove")}
                >
                  Remove table
                </Button>
              ) : null}
            </div>
          </>
        )}
      </SheetFooter>
    </>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

function DialogError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
      {message}
    </p>
  );
}
