"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Ellipsis,
  ExternalLink,
  Grid3X3,
  LayoutGrid,
  LayoutTemplate,
  MessageCircle,
  MonitorSmartphone,
  Plus,
  QrCode,
  Rows3,
  Search,
  SearchX,
  Users,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { QrCodeSvg } from "@/components/QrCodeSvg";
import { Badge } from "@/components/ui/badge";
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
import {
  buildBookingWhatsAppUrl,
  formatShortClockTime,
  getUpcomingReservationForTable,
} from "@/lib/bookings";
import { parseTableName, type OutletInfo, type RawPosTab } from "@/lib/tables";
import type { TableBooking } from "@/lib/types";
import { seatBookingInPosAction } from "@/app/r/[slug]/admin/bookings/actions";
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
  table_id?: string | null;
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
  {
    label: string;
    dot: string;
    chair: string;
    surface: string;
    badge: string;
    text: string;
  }
> = {
  free: {
    label: "Available",
    dot: "bg-zinc-300 dark:bg-zinc-600",
    chair: "bg-zinc-300/90 group-hover:bg-zinc-400 dark:bg-zinc-700",
    surface:
      "border-zinc-200/90 bg-card hover:border-zinc-400/80 dark:border-zinc-800 dark:hover:border-zinc-600",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    text: "text-muted-foreground",
  },
  open: {
    label: "Seated · Bill Open",
    dot: "bg-amber-500",
    chair: "bg-amber-400 dark:bg-amber-500/80",
    surface:
      "border-amber-300/90 bg-card ring-1 ring-amber-500/15 hover:border-amber-400 dark:border-amber-500/40",
    badge: "bg-amber-500/12 text-amber-800 dark:text-amber-300",
    text: "text-amber-800 dark:text-amber-300",
  },
  kitchen: {
    label: "Cooking in Kitchen",
    dot: "bg-violet-500",
    chair: "bg-violet-400 dark:bg-violet-500/80",
    surface:
      "border-violet-300/90 bg-card ring-1 ring-violet-500/15 hover:border-violet-400 dark:border-violet-500/40",
    badge: "bg-violet-500/12 text-violet-800 dark:text-violet-300",
    text: "text-violet-800 dark:text-violet-300",
  },
  ready: {
    label: "Ready to Serve",
    dot: "bg-emerald-500",
    chair: "bg-emerald-500 dark:bg-emerald-500/85",
    surface:
      "border-emerald-400/90 bg-card ring-1 ring-emerald-500/20 hover:border-emerald-500 dark:border-emerald-500/50",
    badge: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300",
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
    name: "Cafe & Bistro",
    summary: "12 tables · 56 seats",
    blurb: "Compact floor for specialty cafes, bakeries, and QSR dining rooms.",
    areas: [
      { name: "Main Hall", detail: "8 tables (2 to 6 seats)" },
      { name: "Family AC", detail: "2 tables of 6 seats" },
      { name: "VIP Cabin", detail: "2 tables of 8 seats" },
    ],
  },
  {
    id: "300-seat",
    name: "Full-Service Restaurant",
    summary: "65 tables · 300 seats",
    blurb: "Multi-hall layout for high-volume casual dining and family AC sections.",
    areas: [
      { name: "Ground Main Hall", detail: "30 tables of 4 seats" },
      { name: "1st Floor Family AC", detail: "20 tables of 4 seats" },
      { name: "Group & Bhojanam Hall", detail: "10 tables of 6 seats" },
      { name: "Banquet & VIP Cabins", detail: "5 tables of 8 seats" },
    ],
  },
  {
    id: "3000-seat",
    name: "Convention & Mega Hall",
    summary: "500 tables · 3,000 seats",
    blurb: "Five-zone layout for convention dining halls, food courts, and banquets.",
    areas: [
      { name: "Halls A, B, C & D", detail: "400 tables (100 × 6 seats per hall)" },
      { name: "Grand Banquet & Lawn", detail: "100 tables of 6 seats" },
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
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function rangeCode(prefix: string, n: number, end: number) {
  const clean = (prefix || "T-").trim();
  const sep = clean.endsWith("-") || clean.endsWith(" ") ? "" : "-";
  return `${clean}${sep}${String(n).padStart(end >= 100 ? 3 : 2, "0")}`;
}

type DialogKind = "single" | "bulk" | "template" | null;
type StatusFilter = "all" | "occupied" | "free";
type FloorDensity = "spatial" | "matrix" | "list";

export function TableFloorBoard({
  slug,
  restaurantName = "Billjot",
  timeZone = "Asia/Kolkata",
  outlets,
  tabs,
  activeOrders,
  upcomingBookings = [],
  todayDineInCount,
  todayDineInRevenue,
}: {
  slug: string;
  restaurantName?: string;
  timeZone?: string;
  outlets: OutletInfo[];
  tabs: RawPosTab[];
  activeOrders: ActiveTableOrder[];
  upcomingBookings?: TableBooking[];
  todayDineInCount: number;
  todayDineInRevenue: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState<number>(0);

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
  }, []);
  const [selectedOutletId, setSelectedOutletId] = useState<string>(
    outlets[0]?.id ?? "",
  );
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [density, setDensity] = useState<FloorDensity>(() =>
    tabs.filter((t) => t.outlet_id === (outlets[0]?.id ?? "")).length > 140
      ? "matrix"
      : "spatial",
  );

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

  const [inspectedTableId, setInspectedTableId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirming, setConfirming] = useState<"clear" | "remove" | null>(null);
  const [removeArea, setRemoveArea] = useState<{
    zone: string;
    count: number;
  } | null>(null);
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
        const matchedOrders = outletOrders.filter(
          (o) =>
            o.table_id === t.id ||
            o.id === t.order_id ||
            (!o.table_id && matchesTableOrder(code, o)),
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
          orderTotal: matchedOrders
            .filter((o) => o.id !== t.order_id)
            .reduce((s, o) => s + Number(o.total_amount), 0),
          updatedAt: t.updated_at,
        };
      })
      .sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true }),
      );
  }, [tabs, activeOrders, selectedOutletId]);

  const zoneStats = useMemo(() => {
    const map = new Map<
      string,
      {
        zone: string;
        tables: number;
        seats: number;
        occupied: number;
        value: number;
        emptyBills: number;
      }
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
  const runningValue = occupied.reduce(
    (s, t) => s + t.cartTotal + t.orderTotal,
    0,
  );
  const occupancyPct = totalTables
    ? Math.round((occupiedTables / totalTables) * 100)
    : 0;

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
      const res = await applyCapacityPresetAction(
        slug,
        selectedOutletId,
        templateId,
        true,
      );
      if (!res.ok) return setDialogError(res.error);
      setDialog(null);
      resetFilters();
      if (templateId === "3000-seat") setDensity("matrix");
      else setDensity("spatial");
      done(
        `Applied ${template.name} layout (${res.created} tables provisioned).`,
      );
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
      setError("Could not copy link. Clipboard permission was denied.");
    }
  }

  const bulkFrom = Math.max(1, Number(bulkStart) || 1);
  const bulkTo = Math.max(bulkFrom, Number(bulkEnd) || bulkFrom);
  const bulkCount = bulkTo - bulkFrom + 1;
  const bulkSeatTotal = bulkCount * Math.max(1, Number(bulkSeats) || 4);
  const zoneNames = zoneStats.map((z) => z.zone);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Floor & Tables"
        description={
          outlet
            ? `${outlet.name}${outlet.city ? ` · ${outlet.city}` : ""} — ${num(totalTables)} tables · ${num(totalSeats)} seats`
            : "Live dining room floor plan, table bills, and QR standees."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
                <SelectTrigger size="sm" className="h-8 w-52 bg-card text-xs">
                  <SelectValue>
                    {(v: string) =>
                      outlets.find((o) => o.id === v)?.name ?? "Select outlet"
                    }
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
              href={`/r/${slug}/admin/bookings`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "bg-card",
              )}
            >
              <CalendarClock className="h-3.5 w-3.5 text-blue-600" />
              Bookings
              {upcomingBookings.length > 0 && (
                <span className="rounded bg-blue-500/12 px-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300 tabular-nums">
                  {upcomingBookings.length}
                </span>
              )}
            </Link>

            <Link
              href={`/r/${slug}/pos`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "bg-card",
              )}
            >
              <MonitorSmartphone className="h-3.5 w-3.5" />
              Open POS
            </Link>

            <Link
              href={`/r/${slug}/admin/tables/qr-sheet`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "bg-card",
              )}
            >
              <QrCode className="h-3.5 w-3.5" />
              QR Standees
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    disabled={pending || !selectedOutletId}
                  />
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add Tables
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => openDialog("single")}>
                  <Plus /> Add single table
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openDialog("bulk")}>
                  <Rows3 /> Generate table range
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openDialog("template")}>
                  <LayoutTemplate /> Apply floor preset
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {(error || notice) && (
        <div
          role={error ? "alert" : "status"}
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2 text-xs font-medium",
            error
              ? "border-destructive/25 bg-destructive/10 text-destructive"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
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
        <div className="rounded-2xl border border-border bg-card shadow-2xs">
          <EmptyState
            icon={LayoutGrid}
            title="No tables on this floor yet"
            description="Start from a ready-made restaurant floor layout (Cafe, 300-seat Restaurant, or 3,000-seat Banquet) or add tables individually."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => openDialog("template")}>
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  Choose floor preset
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openDialog("single")}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add single table
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          {/* Compact Live Floor Telemetry Strip */}
          <div className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-2xs sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                <span>Table Occupancy</span>
                <span className="tabular-nums">{occupancyPct}%</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums tracking-tight">
                  {num(occupiedTables)}
                </span>
                <span className="text-xs text-muted-foreground">
                  / {num(totalTables)} seated
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-[width]"
                  style={{ width: `${occupancyPct}%` }}
                />
              </div>
            </div>

            <div className="border-l border-border px-4 py-3 sm:border-l-0">
              <div className="text-[11px] font-medium text-muted-foreground">
                Seating Capacity
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums tracking-tight">
                  {num(totalSeats)}
                </span>
                <span className="text-xs text-muted-foreground">seats</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {num(occupiedSeats)} active · {num(totalSeats - occupiedSeats)} open
              </div>
            </div>

            <div className="px-4 py-3">
              <div className="text-[11px] font-medium text-muted-foreground">
                Live Floor Value
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
                {inr(runningValue)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Running tabs &amp; active KOTs
              </div>
            </div>

            <div className="border-l border-border px-4 py-3 sm:border-l-0">
              <div className="text-[11px] font-medium text-muted-foreground">
                Dine-In Revenue Today
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
                {inr(todayDineInRevenue)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {todayDineInCount > 0
                  ? `${todayDineInCount} settled ${todayDineInCount === 1 ? "bill" : "bills"} · avg ${inr(todayDineInRevenue / todayDineInCount)}`
                  : "No settled dine-in bills yet"}
              </div>
            </div>
          </div>

          {/* Unified Floor Section Bar + Controls */}
          <div className="rounded-2xl border border-border bg-card shadow-2xs">
            {/* Hall / Dining Section Underline Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 pt-2.5 pb-2">
              <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                <button
                  type="button"
                  onClick={() => setSelectedZone("all")}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    selectedZone === "all"
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span>All Floors</span>
                  <span className="rounded bg-background px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground shadow-2xs">
                    {num(totalTables)}
                  </span>
                </button>

                {zoneStats.map((z) => {
                  const active = selectedZone === z.zone;
                  return (
                    <button
                      key={z.zone}
                      type="button"
                      onClick={() => setSelectedZone(z.zone)}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <span>{z.zone}</span>
                      <span className="rounded bg-background px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground shadow-2xs">
                        {num(z.tables)}
                      </span>
                      {z.occupied > 0 && (
                        <span
                          title={`${z.occupied} occupied`}
                          className="h-1.5 w-1.5 rounded-full bg-amber-500"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Right-side compact search + status + density */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-48 sm:w-56">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Table, guest, token..."
                    aria-label="Find a table"
                    className="h-7 bg-background pl-8 text-xs"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5 text-[11px]">
                  {(
                    [
                      { id: "all", label: "All", count: totalTables },
                      { id: "occupied", label: "Seated", count: occupiedTables },
                      { id: "free", label: "Open", count: freeTables },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setStatusFilter(f.id)}
                      className={cn(
                        "inline-flex h-6 items-center gap-1 rounded-md px-2 font-medium transition-colors",
                        statusFilter === f.id
                          ? "bg-card text-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span>{f.label}</span>
                      <span className="tabular-nums opacity-70">
                        {num(f.count)}
                      </span>
                    </button>
                  ))}
                </div>

                <div
                  className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5"
                  role="group"
                  aria-label="Floor density"
                >
                  <button
                    type="button"
                    title="Spatial Floor Plan (Tables with Seats)"
                    onClick={() => setDensity("spatial")}
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
                      density === "spatial"
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <LayoutGrid className="h-3 w-3" />
                    <span className="hidden sm:inline">Floor</span>
                  </button>
                  <button
                    type="button"
                    title="High-Density Matrix (Banquet / 500+ Tables)"
                    onClick={() => setDensity("matrix")}
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
                      density === "matrix"
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Grid3X3 className="h-3 w-3" />
                    <span className="hidden sm:inline">Matrix</span>
                  </button>
                  <button
                    type="button"
                    title="Detailed Table & Bill List View"
                    onClick={() => setDensity("list")}
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
                      density === "list"
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Rows3 className="h-3 w-3" />
                    <span className="hidden sm:inline">List</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Legend Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/25 px-4 py-1.5 text-[11px] text-muted-foreground">
              <div className="flex flex-wrap items-center gap-4">
                {(["free", "open", "kitchen", "ready"] as const).map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5">
                    <span
                      className={cn("h-2 w-2 rounded-full", STATUS_META[s].dot)}
                    />
                    {STATUS_META[s].label}
                  </span>
                ))}
              </div>
              <span>Click any table to inspect bill &amp; QR standee</span>
            </div>

            {/* Architectural Floor Canvas */}
            <div className="bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:18px_18px] bg-zinc-50/75 dark:bg-zinc-950/50 p-4 sm:p-6">
              {sections.length === 0 ? (
                <div className="rounded-xl border border-border bg-card">
                  <EmptyState
                    icon={SearchX}
                    title="No matching tables"
                    description="Adjust your search or status filter to see the rest of the floor."
                    action={
                      <Button size="sm" variant="outline" onClick={resetFilters}>
                        Reset filters
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="space-y-7">
                  {sections.map(({ stat, tables: list }) => (
                    <section key={stat.zone} aria-label={stat.zone}>
                      {/* Dining Hall Header */}
                      <div className="mb-3.5 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <h2 className="truncate text-xs font-semibold uppercase tracking-wider text-foreground/85">
                            {stat.zone}
                          </h2>
                          <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground shadow-2xs">
                            {num(stat.tables)} tables · {num(stat.seats)} seats
                          </span>
                          {stat.occupied > 0 && (
                            <Badge
                              variant="secondary"
                              className="text-[11px] font-medium"
                            >
                              {stat.occupied} active · {inr(stat.value)}
                            </Badge>
                          )}
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`${stat.zone} options`}
                                className="bg-card/80 text-muted-foreground shadow-2xs hover:bg-card hover:text-foreground"
                              />
                            }
                          >
                            <Ellipsis className="h-3.5 w-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                              onClick={() => {
                                setNewZone(stat.zone);
                                openDialog("single");
                              }}
                            >
                              <Plus /> Add table to {stat.zone}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setBulkZone(stat.zone);
                                openDialog("bulk");
                              }}
                            >
                              <Rows3 /> Add range to {stat.zone}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={stat.emptyBills === 0}
                              onClick={() =>
                                setRemoveArea({
                                  zone: stat.zone,
                                  count: stat.emptyBills,
                                })
                              }
                            >
                              Clear unoccupied tables
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {density === "spatial" ? (
                        <div className="grid grid-cols-2 gap-x-3.5 gap-y-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                          {list.map((t) => {
                            const nextRes = mounted
                              ? getUpcomingReservationForTable(
                                  t.id,
                                  upcomingBookings,
                                  nowMs,
                                )?.booking ?? null
                              : null;
                            return (
                              <SpatialTableCard
                                key={t.id}
                                table={t}
                                slug={slug}
                                upcomingReservation={nextRes}
                                timeZone={timeZone}
                                onOpen={() => openTable(t.id)}
                              />
                            );
                          })}
                        </div>
                      ) : density === "matrix" ? (
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
                          {list.map((t) => {
                            const nextRes = mounted
                              ? getUpcomingReservationForTable(
                                  t.id,
                                  upcomingBookings,
                                  nowMs,
                                )?.booking ?? null
                              : null;
                            return (
                              <MatrixTableCell
                                key={t.id}
                                table={t}
                                upcomingReservation={nextRes}
                                onOpen={() => openTable(t.id)}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
                          {list.map((t) => {
                            const st = tableStatus(t);
                            const meta = STATUS_META[st];
                            const totalVal = t.cartTotal + t.orderTotal;
                            const latestOrder = t.activeOrders[0] ?? null;
                            const nextRes = mounted
                              ? getUpcomingReservationForTable(
                                  t.id,
                                  upcomingBookings,
                                  nowMs,
                                )?.booking ?? null
                              : null;
                            const itemPreview =
                              t.cartLines.length > 0
                                ? t.cartLines
                                    .slice(0, 3)
                                    .map((l) => `${l.qty}× ${l.name}`)
                                    .join(", ") +
                                  (t.cartLines.length > 3
                                    ? ` +${t.cartLines.length - 3} more`
                                    : "")
                                : latestOrder?.item_summary.slice(0, 3).join(", ") ??
                                  "";

                            return (
                              <div
                                key={t.id}
                                onClick={() => openTable(t.id)}
                                className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-xs transition hover:bg-muted/40"
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                  <span
                                    className={cn(
                                      "h-2.5 w-2.5 shrink-0 rounded-full",
                                      meta.dot,
                                    )}
                                  />
                                  <div className="w-20 shrink-0 font-semibold text-foreground">
                                    {t.code}
                                  </div>
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                    <Users className="h-3 w-3" />
                                    {t.seats}p
                                  </span>
                                  <span
                                    className={cn(
                                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                      meta.badge,
                                    )}
                                  >
                                    {meta.label}
                                  </span>
                                  {nextRes && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                                      <CalendarClock className="h-3 w-3" />
                                      {formatShortClockTime(nextRes.reserved_for, timeZone)} · {nextRes.customer_name} ({nextRes.party_size}p)
                                    </span>
                                  )}
                                  {itemPreview ? (
                                    <span className="hidden min-w-0 truncate text-muted-foreground md:inline">
                                      {latestOrder?.token_number != null && (
                                        <span className="mr-1.5 font-mono text-[11px] text-foreground">
                                          #{latestOrder.token_number}
                                        </span>
                                      )}
                                      {itemPreview}
                                    </span>
                                  ) : (
                                    <span className="hidden text-muted-foreground/60 md:inline">
                                      No open items
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2.5">
                                  {latestOrder?.placed_at && (
                                    <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      {elapsed(latestOrder.placed_at)}
                                    </span>
                                  )}
                                  {totalVal > 0 && (
                                    <span className="w-16 text-right font-semibold tabular-nums text-foreground">
                                      {inr(totalVal)}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyQrLink(t);
                                    }}
                                    className={cn(
                                      buttonVariants({
                                        variant: "ghost",
                                        size: "xs",
                                      }),
                                      "h-7 px-2 text-[11px]",
                                    )}
                                    title="Copy guest QR ordering link"
                                  >
                                    {copiedId === t.id ? (
                                      <Check className="h-3 w-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                  <Link
                                    href={`/r/${slug}/pos?table=${encodeURIComponent(t.rawName)}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className={cn(
                                      buttonVariants({
                                        variant: "outline",
                                        size: "xs",
                                      }),
                                      "h-7 px-2 text-[11px]",
                                    )}
                                  >
                                    POS
                                    <ArrowUpRight className="ml-0.5 h-3 w-3" />
                                  </Link>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Slide-over Table Inspector & QR Standee */}
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
              restaurantName={restaurantName}
              timeZone={timeZone}
              upcomingReservation={
                mounted
                  ? getUpcomingReservationForTable(
                      inspected.id,
                      upcomingBookings,
                      nowMs,
                    )?.booking ?? null
                  : null
              }
              pending={pending}
              copied={copiedId === inspected.id}
              confirming={confirming}
              onConfirm={setConfirming}
              onCopy={() => copyQrLink(inspected)}
              onClearBill={() => handleClearBill(inspected)}
              onRemove={() => handleRemoveTable(inspected)}
              onSeatReservation={(bookingId) => {
                startTransition(async () => {
                  const res = await seatBookingInPosAction(
                    slug,
                    bookingId,
                    inspected.id,
                  );
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  router.push(
                    `/r/${slug}/pos?table=${encodeURIComponent(inspected.rawName)}`,
                  );
                });
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Add single table */}
      <Dialog
        open={dialog === "single"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a table</DialogTitle>
            <DialogDescription>
              Appears immediately on the floor map and Counter POS with its own QR ordering link.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSingleTable} className="grid gap-4">
            <Field label="Table code" htmlFor="tbl-code">
              <Input
                id="tbl-code"
                placeholder="e.g. T-31 or VIP-06"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-[1fr_6.5rem] gap-3">
              <Field label="Dining hall / area" htmlFor="tbl-zone">
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !newCode.trim()}>
                {pending ? "Adding..." : "Add table"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generate numbered range */}
      <Dialog
        open={dialog === "bulk"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate numbered table range</DialogTitle>
            <DialogDescription>
              Provision an entire dining hall in seconds. Existing table codes are safely skipped.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBulkGenerate} className="grid gap-4">
            <Field label="Dining hall / area" htmlFor="bulk-zone">
              <Input
                id="bulk-zone"
                list="table-areas"
                placeholder="e.g. 2nd Floor Banquet"
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
                {bulkCount > 1 && ` – ${rangeCode(bulkPrefix, bulkTo, bulkTo)}`}
              </span>{" "}
              ({num(bulkCount)} {bulkCount === 1 ? "table" : "tables"} ·{" "}
              {num(bulkSeatTotal)} seats).
              {bulkCount > 600 &&
                " Maximum 600 tables per batch — split into smaller ranges."}
            </p>
            <DialogError message={dialogError} />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || bulkCount > 600}>
                {pending ? "Generating..." : `Add ${num(bulkCount)} tables`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Floor Preset Dialog */}
      <Dialog
        open={dialog === "template"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply floor capacity preset</DialogTitle>
            <DialogDescription>
              Provision a multi-hall restaurant layout in one click. Occupied tables with active bills are always preserved.
            </DialogDescription>
          </DialogHeader>
          <div
            role="radiogroup"
            aria-label="Floor preset"
            className="grid gap-3 sm:grid-cols-3"
          >
            {TEMPLATES.map((tpl) => {
              const selected = tpl.id === templateId;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTemplateId(tpl.id)}
                  className={cn(
                    "flex flex-col rounded-xl border p-4 text-left transition-all",
                    selected
                      ? "border-foreground bg-muted/30 ring-1 ring-foreground"
                      : "border-border bg-card hover:border-foreground/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{tpl.name}</span>
                    <span
                      className={cn(
                        "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : "border-border",
                      )}
                    >
                      {selected && (
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      )}
                    </span>
                  </div>
                  <span className="mt-0.5 text-xs font-medium text-foreground/80">
                    {tpl.summary}
                  </span>
                  <span className="mt-2 text-xs text-muted-foreground">
                    {tpl.blurb}
                  </span>
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
          <DialogError message={dialogError} />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApplyTemplate}
              disabled={pending}
            >
              {pending
                ? "Applying..."
                : `Apply ${TEMPLATES.find((t) => t.id === templateId)!.name}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm removing unoccupied area tables */}
      <Dialog
        open={removeArea !== null}
        onOpenChange={(o) => !o && setRemoveArea(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove unoccupied tables?</DialogTitle>
            <DialogDescription>
              {removeArea &&
                `${num(removeArea.count)} unoccupied ${removeArea.count === 1 ? "table" : "tables"} in ${removeArea.zone} will be removed. Tables with open bills stay untouched.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRemoveArea(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemoveArea}
              disabled={pending}
            >
              {pending ? "Removing..." : "Remove tables"}
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

/**
 * Spatial Architectural Tabletop Card:
 * Renders top & bottom geometric chair backs proportional to table seat count,
 * wider proportions for 6+ seat family/banquet tables, and clear live status.
 */
function SpatialTableCard({
  table: t,
  slug,
  upcomingReservation,
  timeZone,
  onOpen,
}: {
  table: ParsedTable;
  slug: string;
  upcomingReservation?: TableBooking | null;
  timeZone: string;
  onOpen: () => void;
}) {
  const status = tableStatus(t);
  const meta = STATUS_META[status];
  const isLargeTable = t.seats >= 6;
  const chairsPerEdge = Math.min(4, Math.max(1, Math.ceil(t.seats / 2)));
  const chairs = Array.from({ length: chairsPerEdge });
  const oldest = t.activeOrders.reduce<string | null>(
    (min, o) => (!min || o.placed_at < min ? o.placed_at : min),
    null,
  );
  const totalAmount = t.cartTotal + t.orderTotal;

  return (
    <div
      className={cn(
        "group relative flex flex-col items-center select-none",
        isLargeTable && "sm:col-span-2",
      )}
    >
      {/* Top edge architectural chairs */}
      <div className="mb-1 flex w-4/5 items-center justify-around gap-1.5 px-2">
        {chairs.map((_, idx) => (
          <span
            key={idx}
            className={cn(
              "h-1 flex-1 max-w-7 rounded-t-full transition-colors",
              status === "free" && upcomingReservation
                ? "bg-blue-400 dark:bg-blue-500/80"
                : meta.chair,
            )}
          />
        ))}
      </div>

      {/* Tabletop surface */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t.code}, ${t.seats} seats, ${meta.label}`}
        className={cn(
          "relative flex h-[78px] w-full flex-col justify-between rounded-xl border px-3 py-2.5 text-left shadow-2xs transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
          status === "free" && upcomingReservation
            ? "border-blue-300/90 bg-card ring-1 ring-blue-500/15 hover:border-blue-400 dark:border-blue-500/40"
            : meta.surface,
        )}
      >
        <div className="flex w-full items-center justify-between gap-1.5">
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">
            {t.code}
          </span>

          {status === "free" ? (
            upcomingReservation ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/12 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                <CalendarClock className="h-2.5 w-2.5" />
                {formatShortClockTime(upcomingReservation.reserved_for, timeZone)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Users className="h-2.5 w-2.5 opacity-70" />
                {t.seats}
              </span>
            )
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                meta.badge,
              )}
              suppressHydrationWarning
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
              {oldest ? elapsed(oldest) : "Live"}
            </span>
          )}
        </div>

        {status === "free" ? (
          <div className="flex w-full items-center justify-between text-[11px] text-muted-foreground">
            {upcomingReservation ? (
              <span className="truncate font-medium text-blue-700 dark:text-blue-300">
                {upcomingReservation.customer_name} ({upcomingReservation.party_size}p)
              </span>
            ) : (
              <span>Available</span>
            )}
            <Link
              href={`/r/${slug}/pos?table=${encodeURIComponent(t.rawName)}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
            >
              POS <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="flex w-full items-baseline justify-between gap-2">
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {inr(totalAmount)}
            </span>
            <span className={cn("truncate text-[11px] font-medium", meta.text)}>
              {t.activeOrders.length > 0
                ? `${t.activeOrders.length} KOT`
                : `${t.cartQty} ${t.cartQty === 1 ? "item" : "items"}`}
            </span>
          </div>
        )}
      </button>

      {/* Bottom edge architectural chairs */}
      <div className="mt-1 flex w-4/5 items-center justify-around gap-1.5 px-2">
        {chairs.map((_, idx) => (
          <span
            key={idx}
            className={cn(
              "h-1 flex-1 max-w-7 rounded-b-full transition-colors",
              status === "free" && upcomingReservation
                ? "bg-blue-400 dark:bg-blue-500/80"
                : meta.chair,
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * High-Density Matrix Cell for 3,000-Seat / 500-Table Banquets
 */
function MatrixTableCell({
  table: t,
  upcomingReservation,
  onOpen,
}: {
  table: ParsedTable;
  upcomingReservation?: TableBooking | null;
  onOpen: () => void;
}) {
  const status = tableStatus(t);
  const meta = STATUS_META[status];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex h-12 flex-col justify-between rounded-lg border px-2 py-1.5 text-left shadow-2xs transition-colors",
        status === "free" && upcomingReservation
          ? "border-blue-300 bg-card ring-1 ring-blue-500/15"
          : meta.surface,
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[11px] font-semibold">{t.code}</span>
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            status === "free" && upcomingReservation ? "bg-blue-500" : meta.dot,
          )}
        />
      </div>
      <div className="truncate text-[10px] tabular-nums text-muted-foreground">
        {status === "free"
          ? upcomingReservation
            ? "Reserved"
            : `${t.seats}p`
          : inr(t.cartTotal + t.orderTotal)}
      </div>
    </button>
  );
}

function TableDetails({
  table: t,
  slug,
  restaurantName,
  timeZone,
  upcomingReservation,
  pending,
  copied,
  confirming,
  onConfirm,
  onCopy,
  onClearBill,
  onRemove,
  onSeatReservation,
}: {
  table: ParsedTable;
  slug: string;
  restaurantName: string;
  timeZone: string;
  upcomingReservation?: TableBooking | null;
  pending: boolean;
  copied: boolean;
  confirming: "clear" | "remove" | null;
  onConfirm: (c: "clear" | "remove" | null) => void;
  onCopy: () => void;
  onClearBill: () => void;
  onRemove: () => void;
  onSeatReservation: (bookingId: string) => void;
}) {
  const status = tableStatus(t);
  const meta = STATUS_META[status];
  const hasCart = t.cartQty > 0;
  const total = t.cartTotal + t.orderTotal;
  const guestMenuUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/r/${slug}?table=${encodeURIComponent(t.code)}`
      : `/r/${slug}?table=${encodeURIComponent(t.code)}`;

  return (
    <>
      <SheetHeader className="border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
              meta.badge,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
        </div>
        <SheetTitle className="mt-1 text-xl">{t.code}</SheetTitle>
        <SheetDescription>
          {t.zone} · {t.seats} seats
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {upcomingReservation && (
          <section className="rounded-xl border border-blue-200 bg-blue-500/8 p-3.5 dark:border-blue-900/60">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 dark:text-blue-300">
                <CalendarClock className="h-3.5 w-3.5" />
                Upcoming Reservation · {formatShortClockTime(upcomingReservation.reserved_for, timeZone)}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {upcomingReservation.booking_code}
              </span>
            </div>
            <div className="mt-1.5 text-sm font-semibold text-foreground">
              {upcomingReservation.customer_name} ({upcomingReservation.party_size} guests)
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {upcomingReservation.customer_phone}
              {upcomingReservation.occasion ? ` · ${upcomingReservation.occasion}` : ""}
              {upcomingReservation.deposit_status === "paid"
                ? ` · Deposit ₹${Number(upcomingReservation.deposit_amount ?? 0).toFixed(0)} paid`
                : ""}
            </div>
            {upcomingReservation.special_requests && (
              <p className="mt-1 text-xs text-muted-foreground">
                Note: {upcomingReservation.special_requests}
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button
                size="xs"
                disabled={pending}
                onClick={() => onSeatReservation(upcomingReservation.id)}
              >
                Seat Guest in POS
              </Button>
              {(() => {
                const waUrl = buildBookingWhatsAppUrl({
                  phone: upcomingReservation.customer_phone,
                  customerName: upcomingReservation.customer_name,
                  restaurantName,
                  bookingCode: upcomingReservation.booking_code,
                  kind: "reminder",
                  reservedFor: upcomingReservation.reserved_for,
                  partySize: upcomingReservation.party_size,
                  tableCode: t.code,
                  timeZone,
                });
                return waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
                  >
                    <MessageCircle className="mr-1 h-3 w-3 text-emerald-600" />
                    WhatsApp
                  </a>
                ) : null;
              })()}
            </div>
          </section>
        )}

        {status === "free" ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3.5 text-xs text-muted-foreground">
            Table is currently available. Launch Counter POS below to start a dine-in tab, or let guests scan the table QR code.
          </div>
        ) : (
          <>
            {t.activeOrders.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Kitchen Tickets
                </h3>
                <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
                  {t.activeOrders.map((o) => (
                    <li key={o.id} className="px-3.5 py-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <Link
                          href={`/r/${slug}/admin/orders/${o.id}`}
                          className="font-semibold hover:underline"
                        >
                          Token #{o.token_number ?? o.unique_order_id?.slice(-4) ?? "—"}
                        </Link>
                        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">
                            {ORDER_STATUS_LABEL[o.status ?? ""] ?? o.status}
                          </Badge>
                          <span
                            className="inline-flex items-center gap-1"
                            suppressHydrationWarning
                          >
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
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Running Tab Items
                </h3>
                <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card px-3.5 py-1 text-sm">
                  {t.cartLines.map((l, i) => (
                    <li
                      key={i}
                      className="flex items-baseline justify-between gap-3 py-2 text-xs"
                    >
                      <span className="min-w-0 font-medium">
                        <span className="mr-1.5 tabular-nums text-muted-foreground">
                          {l.qty}×
                        </span>
                        {l.name}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {inr(l.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex items-baseline justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground">
                Running Table Total
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {inr(total)}
              </span>
            </div>
          </>
        )}

        {/* Scannable Table QR Standee Card */}
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-lg border border-border bg-white p-2 shadow-2xs">
              <QrCodeSvg value={guestMenuUrl} size={84} />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="text-xs font-semibold">Table QR Ordering</div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Guests scanning this code open the menu pre-linked to{" "}
                <span className="font-medium text-foreground">{t.code}</span>.
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <Button variant="outline" size="xs" onClick={onCopy}>
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy URL
                    </>
                  )}
                </Button>
                <Link
                  href={`/r/${slug}?table=${encodeURIComponent(t.code)}`}
                  target="_blank"
                  className={buttonVariants({ variant: "ghost", size: "xs" })}
                >
                  Preview Menu
                  <ExternalLink className="ml-1 h-2.5 w-2.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>

      <SheetFooter className="border-t border-border bg-muted/15">
        {confirming ? (
          <div className="w-full space-y-3">
            <p className="text-xs text-muted-foreground">
              {confirming === "clear"
                ? `Discard ${t.cartQty} ${t.cartQty === 1 ? "item" : "items"} on ${t.code}?`
                : `Delete ${t.code} from ${t.zone}?`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onConfirm(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={confirming === "clear" ? onClearBill : onRemove}
                disabled={pending}
              >
                {confirming === "clear" ? "Clear bill" : "Delete table"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-2">
            <Link
              href={`/r/${slug}/pos?table=${encodeURIComponent(t.rawName)}`}
              className={cn(buttonVariants({ size: "default" }), "w-full")}
            >
              <MonitorSmartphone className="h-4 w-4" />
              {hasCart ? "Resume Table Bill in POS" : "Start Bill in POS"}
            </Link>
            <div className="flex justify-end">
              {hasCart ? (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onConfirm("clear")}
                >
                  Clear open bill
                </Button>
              ) : t.activeOrders.length === 0 ? (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onConfirm("remove")}
                >
                  Delete table
                </Button>
              ) : null}
            </div>
          </div>
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
    <p
      role="alert"
      className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
    >
      {message}
    </p>
  );
}
