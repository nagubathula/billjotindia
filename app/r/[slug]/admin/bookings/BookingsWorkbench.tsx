"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  MessageCircle,
  MonitorSmartphone,
  Plus,
  Search,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BOOKING_OCCASIONS,
  buildBookingWhatsAppUrl,
  formatBookingTime,
  wallClockDateTimeToIso,
  type FloorTableInfo,
} from "@/lib/bookings";
import { cn } from "@/lib/utils";
import type { BookingStatus, DepositStatus, TableBooking } from "@/lib/types";
import {
  assignBookingTableAction,
  createStaffBookingAction,
  saveOutletBookingPolicyAction,
  seatBookingInPosAction,
  updateBookingDepositStatusAction,
  updateBookingStatusAction,
} from "./actions";

export type BookingOutletPolicy = {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  bookings_enabled: boolean;
  booking_slot_minutes: number;
  booking_turn_minutes: number;
  booking_max_party_size: number;
  booking_advance_days: number;
  booking_deposit_per_guest: number;
  booking_deposit_min_party: number;
};

const STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  pending_payment: {
    label: "Awaiting Deposit",
    className: "border-amber-300 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  pending: {
    label: "Pending",
    className: "border-amber-300 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  confirmed: {
    label: "Confirmed",
    className: "border-blue-300 bg-blue-500/10 text-blue-800 dark:text-blue-300",
  },
  waitlisted: {
    label: "Waiting",
    className: "border-amber-300 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  notified: {
    label: "Table Ready Notified",
    className: "border-violet-300 bg-violet-500/10 text-violet-800 dark:text-violet-300",
  },
  seated: {
    label: "Seated",
    className: "border-emerald-400 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  },
  completed: {
    label: "Completed",
    className: "border-border bg-muted text-muted-foreground",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-border bg-muted text-muted-foreground line-through",
  },
  no_show: {
    label: "No-Show",
    className: "border-rose-300 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};

function dateKeyInZone(isoOrDate: string | Date, timeZone: string): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function BookingsWorkbench({
  slug,
  restaurantName,
  outlets,
  initialOutletId,
  bookings: initialBookings,
  floorTablesByOutlet,
}: {
  slug: string;
  restaurantName: string;
  outlets: BookingOutletPolicy[];
  initialOutletId: string;
  bookings: TableBooking[];
  floorTablesByOutlet: Record<string, FloorTableInfo[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selectedOutletId, setSelectedOutletId] = useState<string>(
    initialOutletId || outlets[0]?.id || "",
  );
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState<number>(0);

  const [dateScope, setDateScope] = useState<"today" | "tomorrow" | "upcoming" | "all">("upcoming");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [copiedLink, setCopiedLink] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Create reservation / walk-in dialog
  const [createMode, setCreateMode] = useState<"reservation" | "waitlist" | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("19:30");
  const [preferredZone, setPreferredZone] = useState("any");
  const [specificTableId, setSpecificTableId] = useState("auto");
  const [occasion, setOccasion] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [waiveDeposit, setWaiveDeposit] = useState(true);

  const outlet = useMemo(
    () => outlets.find((o) => o.id === selectedOutletId) ?? outlets[0],
    [outlets, selectedOutletId],
  );
  const tables = useMemo(
    () => floorTablesByOutlet[outlet?.id ?? ""] ?? [],
    [floorTablesByOutlet, outlet],
  );
  const zones = useMemo(
    () => [...new Set(tables.map((t) => t.zone))].sort(),
    [tables],
  );
  const tableById = useMemo(
    () => new Map(tables.map((t) => [t.id, t])),
    [tables],
  );

  // Policy form controlled state keyed cleanly per selected outlet
  const [policyEnabled, setPolicyEnabled] = useState<boolean>(
    outlet?.bookings_enabled ?? true,
  );
  const [policySlotMins, setPolicySlotMins] = useState<string>(
    String(outlet?.booking_slot_minutes ?? 30),
  );
  const [policyTurnMins, setPolicyTurnMins] = useState<string>(
    String(outlet?.booking_turn_minutes ?? 90),
  );
  const [policyMaxParty, setPolicyMaxParty] = useState<string>(
    String(outlet?.booking_max_party_size ?? 20),
  );
  const [policyAdvanceDays, setPolicyAdvanceDays] = useState<string>(
    String(outlet?.booking_advance_days ?? 30),
  );
  const [policyDepositPerGuest, setPolicyDepositPerGuest] = useState<string>(
    String(outlet?.booking_deposit_per_guest ?? 0),
  );
  const [policyDepositMinParty, setPolicyDepositMinParty] = useState<string>(
    String(outlet?.booking_deposit_min_party ?? 1),
  );
  const [policySeedOutletId, setPolicySeedOutletId] = useState<string>(
    outlet?.id ?? "",
  );

  if (outlet && policySeedOutletId !== outlet.id) {
    setPolicySeedOutletId(outlet.id);
    setPolicyEnabled(outlet.bookings_enabled);
    setPolicySlotMins(String(outlet.booking_slot_minutes));
    setPolicyTurnMins(String(outlet.booking_turn_minutes));
    setPolicyMaxParty(String(outlet.booking_max_party_size));
    setPolicyAdvanceDays(String(outlet.booking_advance_days));
    setPolicyDepositPerGuest(String(outlet.booking_deposit_per_guest));
    setPolicyDepositMinParty(String(outlet.booking_deposit_min_party));
  }

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
    const tz = outlet?.timezone ?? "Asia/Kolkata";
    setDateStr(dateKeyInZone(new Date(), tz));
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [outlet?.timezone]);

  const outletBookings = useMemo(
    () => initialBookings.filter((b) => b.outlet_id === outlet?.id),
    [initialBookings, outlet?.id],
  );

  const tz = outlet?.timezone ?? "Asia/Kolkata";
  const todayKey = mounted ? dateKeyInZone(new Date(nowMs), tz) : "";
  const tomorrowKey = mounted
    ? dateKeyInZone(new Date(nowMs + 24 * 60 * 60_000), tz)
    : "";

  const reservations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return outletBookings.filter((b) => {
      if (b.booking_type !== "reservation") return false;
      const bDay = dateKeyInZone(b.reserved_for, tz);
      if (dateScope === "today" && todayKey && bDay !== todayKey) return false;
      if (dateScope === "tomorrow" && tomorrowKey && bDay !== tomorrowKey) {
        return false;
      }
      if (
        dateScope === "upcoming" &&
        todayKey &&
        bDay < todayKey &&
        b.status !== "seated"
      ) {
        return false;
      }

      if (statusFilter === "active") {
        if (b.status === "cancelled" || b.status === "completed" || b.status === "no_show") {
          return false;
        }
      } else if (statusFilter !== "all" && b.status !== statusFilter) {
        return false;
      }

      if (!q) return true;
      return (
        b.customer_name.toLowerCase().includes(q) ||
        b.customer_phone.toLowerCase().includes(q) ||
        b.booking_code.toLowerCase().includes(q)
      );
    });
  }, [outletBookings, tz, dateScope, todayKey, tomorrowKey, statusFilter, search]);

  const activeWaitlist = useMemo(
    () =>
      outletBookings
        .filter(
          (b) =>
            b.booking_type === "waitlist" &&
            (b.status === "waitlisted" || b.status === "notified"),
        )
        .sort((a, b) => (a.queue_number ?? 999) - (b.queue_number ?? 999)),
    [outletBookings],
  );

  const recentWaitlistHistory = useMemo(
    () =>
      outletBookings
        .filter(
          (b) =>
            b.booking_type === "waitlist" &&
            b.status !== "waitlisted" &&
            b.status !== "notified",
        )
        .slice(-10)
        .reverse(),
    [outletBookings],
  );

  // KPI metrics
  const todayReservationsCount = useMemo(
    () =>
      outletBookings.filter(
        (b) =>
          b.booking_type === "reservation" &&
          (!todayKey || dateKeyInZone(b.reserved_for, tz) === todayKey) &&
          b.status !== "cancelled" &&
          b.status !== "no_show",
      ).length,
    [outletBookings, tz, todayKey],
  );

  const arrivingNext2hCount = useMemo(() => {
    if (!mounted) return 0;
    return outletBookings.filter((b) => {
      if (b.booking_type !== "reservation") return false;
      if (b.status !== "confirmed" && b.status !== "pending") return false;
      const ms = new Date(b.reserved_for).getTime();
      return ms >= nowMs - 15 * 60_000 && ms <= nowMs + 120 * 60_000;
    }).length;
  }, [outletBookings, mounted, nowMs]);

  const depositsCollectedTotal = useMemo(
    () =>
      outletBookings
        .filter((b) => b.deposit_status === "paid")
        .reduce((s, b) => s + Number(b.deposit_amount ?? 0), 0),
    [outletBookings],
  );

  function openCreateModal(mode: "reservation" | "waitlist") {
    setCreateMode(mode);
    setGuestName("");
    setGuestPhone("");
    setGuestEmail("");
    setPartySize("2");
    setDateStr(todayKey || new Date().toISOString().slice(0, 10));
    setTimeStr("19:30");
    setPreferredZone("any");
    setSpecificTableId("auto");
    setOccasion("");
    setSpecialRequests("");
    setWaiveDeposit(true);
    setActionMsg(null);
  }

  function handleCopyPublicLink() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/r/${slug}/book`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!outlet || !createMode) return;
    setActionMsg(null);

    let reservedForIso: string | undefined;
    if (createMode === "reservation") {
      if (!dateStr || !timeStr) {
        setActionMsg({ kind: "err", text: "Choose reservation date & time." });
        return;
      }
      const convertedIso = wallClockDateTimeToIso(
        dateStr,
        timeStr,
        outlet.timezone,
      );
      if (!convertedIso) {
        setActionMsg({ kind: "err", text: "Invalid reservation date or time." });
        return;
      }
      reservedForIso = convertedIso;
    }

    start(async () => {
      const res = await createStaffBookingAction(slug, {
        outletId: outlet.id,
        bookingType: createMode,
        source: createMode === "waitlist" ? "walk_in" : "phone",
        customerName: guestName,
        customerPhone: guestPhone,
        customerEmail: guestEmail || undefined,
        partySize: Number(partySize) || 2,
        preferredZone: preferredZone === "any" ? undefined : preferredZone,
        tableId: specificTableId === "auto" ? null : specificTableId,
        occasion: occasion || undefined,
        specialRequests: specialRequests || undefined,
        reservedForIso,
        waiveDeposit,
      });

      if (!res.ok) {
        setActionMsg({ kind: "err", text: res.error });
        return;
      }
      setCreateMode(null);
      setActionMsg({
        kind: "ok",
        text:
          createMode === "waitlist"
            ? `Added ${res.booking.customer_name} to waitlist (#${res.booking.queue_number}).`
            : `Confirmed reservation ${res.booking.booking_code} for ${res.booking.customer_name}.`,
      });
      router.refresh();
    });
  }

  function handleSeatInPos(booking: TableBooking) {
    setActionMsg(null);
    start(async () => {
      const res = await seatBookingInPosAction(slug, booking.id);
      if (!res.ok) {
        setActionMsg({ kind: "err", text: res.error });
        return;
      }
      const queryParams = new URLSearchParams();
      if (res.tableCode) queryParams.set("table", res.tableCode);
      router.push(`/r/${slug}/pos?${queryParams.toString()}`);
    });
  }

  function handleStatusChange(bookingId: string, nextStatus: BookingStatus) {
    setActionMsg(null);
    start(async () => {
      const res = await updateBookingStatusAction(slug, bookingId, nextStatus);
      if (!res.ok) setActionMsg({ kind: "err", text: res.error });
      else router.refresh();
    });
  }

  function handleDepositStatus(bookingId: string, nextStatus: DepositStatus) {
    setActionMsg(null);
    start(async () => {
      const res = await updateBookingDepositStatusAction(
        slug,
        bookingId,
        nextStatus,
      );
      if (!res.ok) setActionMsg({ kind: "err", text: res.error });
      else router.refresh();
    });
  }

  function handleTableAssign(bookingId: string, nextTableId: string) {
    setActionMsg(null);
    start(async () => {
      const res = await assignBookingTableAction(
        slug,
        bookingId,
        nextTableId === "unassigned" ? null : nextTableId,
      );
      if (!res.ok) setActionMsg({ kind: "err", text: res.error });
      else router.refresh();
    });
  }

  function handleNotifyWaitlist(b: TableBooking) {
    setActionMsg(null);
    const assignedCode = b.table_id ? tableById.get(b.table_id)?.code : null;
    const waUrl = buildBookingWhatsAppUrl({
      phone: b.customer_phone,
      customerName: b.customer_name,
      restaurantName,
      bookingCode: b.booking_code,
      kind: "waitlist_ready",
      partySize: b.party_size,
      tableCode: assignedCode,
      timeZone: tz,
    });
    start(async () => {
      const res = await updateBookingStatusAction(slug, b.id, "notified");
      if (!res.ok) {
        setActionMsg({ kind: "err", text: res.error });
        return;
      }
      if (waUrl && typeof window !== "undefined") {
        window.open(waUrl, "_blank", "noopener,noreferrer");
      }
      router.refresh();
    });
  }

  function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!outlet) return;
    setActionMsg(null);
    start(async () => {
      const res = await saveOutletBookingPolicyAction(slug, {
        outletId: outlet.id,
        bookingsEnabled: policyEnabled,
        slotMinutes: Number(policySlotMins) || 30,
        turnMinutes: Number(policyTurnMins) || 90,
        maxPartySize: Number(policyMaxParty) || 20,
        advanceDays: Number(policyAdvanceDays) || 30,
        depositPerGuest: Number(policyDepositPerGuest) || 0,
        depositMinParty: Number(policyDepositMinParty) || 1,
      });
      if (!res.ok) {
        setActionMsg({ kind: "err", text: res.error });
        return;
      }
      setActionMsg({
        kind: "ok",
        text: `Saved booking & cover-charge policy for ${outlet.name}.`,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Table Bookings & Waitlist"
        description="Manage scheduled reservations, live walk-in queue, table assignments, and cover-charge policies."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {outlets.length > 1 && (
              <Select
                value={selectedOutletId}
                onValueChange={(v) => v && setSelectedOutletId(v)}
              >
                <SelectTrigger size="sm" className="w-44 text-xs">
                  <SelectValue>{outlet?.name}</SelectValue>
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyPublicLink}
            >
              {copiedLink ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                  Copied link
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy Booking URL
                </>
              )}
            </Button>
            <Link
              href={`/r/${slug}/book`}
              target="_blank"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Public Page
              <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openCreateModal("waitlist")}
            >
              <Users className="mr-1 h-3.5 w-3.5" />
              Add Walk-in
            </Button>
            <Button size="sm" onClick={() => openCreateModal("reservation")}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              New Reservation
            </Button>
          </div>
        }
      />

      {actionMsg && (
        <div
          role="status"
          className={cn(
            "flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-medium",
            actionMsg.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          <span>{actionMsg.text}</span>
          <button
            type="button"
            onClick={() => setActionMsg(null)}
            className="opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card size="sm">
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Today&apos;s Bookings</span>
              <CalendarClock className="h-3.5 w-3.5" />
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {todayReservationsCount}
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Arriving Next 2h</span>
              <Clock className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {arrivingNext2hCount}
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Live Waitlist</span>
              <Users className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {activeWaitlist.length}
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Cover Deposits Paid</span>
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              ₹{depositsCollectedTotal.toFixed(0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="reservations">
        <TabsList>
          <TabsTrigger value="reservations">
            Reservations ({reservations.length})
          </TabsTrigger>
          <TabsTrigger value="waitlist">
            Live Waitlist ({activeWaitlist.length})
          </TabsTrigger>
          <TabsTrigger value="policy">
            Policy &amp; Deposits
          </TabsTrigger>
        </TabsList>

        {/* Reservations List */}
        <TabsContent value="reservations" className="space-y-3">
          <Card>
            <CardHeader className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: "today", label: "Today" },
                    { id: "tomorrow", label: "Tomorrow" },
                    { id: "upcoming", label: "Upcoming" },
                    { id: "all", label: "All (7d+)" },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDateScope(d.id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      dateScope === d.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-56">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Guest, phone, or RES-..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => v && setStatusFilter(v)}
                >
                  <SelectTrigger size="sm" className="w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active bookings</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="seated">Seated</SelectItem>
                    <SelectItem value="pending_payment">Awaiting deposit</SelectItem>
                    <SelectItem value="all">All statuses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {reservations.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={CalendarClock}
                    title="No matching reservations"
                    description="Add a phone booking or share your public booking page link with guests."
                    action={
                      <Button size="sm" onClick={() => openCreateModal("reservation")}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        New Reservation
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {reservations.map((b) => {
                    const meta = STATUS_BADGE[b.status] ?? {
                      label: b.status,
                      className: "border-border bg-muted text-foreground",
                    };
                    const assignedTable = b.table_id
                      ? tableById.get(b.table_id)
                      : null;
                    const waConfirmUrl = buildBookingWhatsAppUrl({
                      phone: b.customer_phone,
                      customerName: b.customer_name,
                      restaurantName,
                      bookingCode: b.booking_code,
                      kind: "confirmed",
                      reservedFor: b.reserved_for,
                      partySize: b.party_size,
                      tableCode: assignedTable?.code,
                      timeZone: tz,
                    });

                    return (
                      <div
                        key={b.id}
                        className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-foreground">
                              {b.booking_code}
                            </span>
                            <Badge variant="outline" className={cn("text-[11px]", meta.className)}>
                              {meta.label}
                            </Badge>
                            <span className="text-xs font-medium text-foreground">
                              {formatBookingTime(b.reserved_for, tz)}
                            </span>
                            <Badge variant="secondary" className="text-[11px] tabular-nums">
                              {b.party_size} guests
                            </Badge>
                            {b.preferred_zone && (
                              <Badge variant="outline" className="text-[11px]">
                                {b.preferred_zone}
                              </Badge>
                            )}
                            {b.occasion && (
                              <Badge variant="outline" className="border-pink-300 bg-pink-500/10 text-[11px] text-pink-700 dark:text-pink-300">
                                {b.occasion}
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-semibold text-foreground">
                              {b.customer_name}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {b.customer_phone}
                            </span>
                            {Number(b.deposit_amount ?? 0) > 0 && (
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                                  b.deposit_status === "paid"
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                    : b.deposit_status === "refunded"
                                      ? "bg-muted text-muted-foreground line-through"
                                      : "bg-amber-500/10 text-amber-800 dark:text-amber-300",
                                )}
                              >
                                Deposit ₹{Number(b.deposit_amount).toFixed(0)} · {b.deposit_status}
                              </span>
                            )}
                          </div>

                          {b.special_requests && (
                            <p className="text-xs text-muted-foreground">
                              Note: {b.special_requests}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={b.table_id ?? "unassigned"}
                            disabled={pending || b.status === "cancelled" || b.status === "completed"}
                            onValueChange={(v) => v && handleTableAssign(b.id, v)}
                          >
                            <SelectTrigger size="sm" className="w-40 text-xs">
                              <SelectValue>
                                {assignedTable
                                  ? `${assignedTable.code} (${assignedTable.seats}p)`
                                  : "Auto / Unassigned"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {tables.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.code} · {t.zone} ({t.seats}p)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {waConfirmUrl && (
                            <a
                              href={waConfirmUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                buttonVariants({ variant: "outline", size: "xs" }),
                              )}
                              title="Send WhatsApp confirmation"
                            >
                              <MessageCircle className="mr-1 h-3 w-3 text-emerald-600" />
                              WhatsApp
                            </a>
                          )}

                          {b.deposit_status === "pending" && Number(b.deposit_amount) > 0 && (
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={pending}
                              onClick={() => handleDepositStatus(b.id, "paid")}
                            >
                              Mark Paid
                            </Button>
                          )}

                          {(b.status === "confirmed" || b.status === "pending" || b.status === "pending_payment") && (
                            <Button
                              size="xs"
                              disabled={pending}
                              onClick={() => handleSeatInPos(b)}
                            >
                              <MonitorSmartphone className="mr-1 h-3 w-3" />
                              Seat in POS
                            </Button>
                          )}

                          {b.status === "seated" && (
                            <>
                              <Link
                                href={`/r/${slug}/pos${assignedTable ? `?table=${encodeURIComponent(assignedTable.code)}` : ""}`}
                                className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
                              >
                                Open POS
                              </Link>
                              <Button
                                variant="secondary"
                                size="xs"
                                disabled={pending}
                                onClick={() => handleStatusChange(b.id, "completed")}
                              >
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Complete
                              </Button>
                            </>
                          )}

                          {b.status !== "cancelled" && b.status !== "completed" && b.status !== "no_show" && (
                            <>
                              <Button
                                variant="ghost"
                                size="xs"
                                disabled={pending}
                                onClick={() => handleStatusChange(b.id, "no_show")}
                              >
                                No-show
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                disabled={pending}
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleStatusChange(b.id, "cancelled")}
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Live Waitlist Queue */}
        <TabsContent value="waitlist" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
              <div>
                <CardTitle>Active Walk-in Queue</CardTitle>
                <CardDescription>
                  Call guests when a matching table opens and seat them directly in the POS.
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => openCreateModal("waitlist")}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Walk-in Party
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {activeWaitlist.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Users}
                    title="No walk-in parties waiting"
                    description="When the floor fills up, add arriving guests here to track their wait ETA and notify them on WhatsApp."
                    action={
                      <Button size="sm" onClick={() => openCreateModal("waitlist")}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add Walk-in Party
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {activeWaitlist.map((b) => {
                    const elapsedMins = mounted
                      ? Math.max(
                          0,
                          Math.floor(
                            (nowMs - new Date(b.created_at).getTime()) / 60_000,
                          ),
                        )
                      : 0;
                    const assignedTable = b.table_id
                      ? tableById.get(b.table_id)
                      : null;
                    return (
                      <div
                        key={b.id}
                        className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 font-mono text-sm font-bold text-amber-800 dark:text-amber-300">
                            #{b.queue_number ?? "—"}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-foreground">
                                {b.customer_name}
                              </span>
                              <Badge variant="secondary" className="text-[11px] tabular-nums">
                                {b.party_size} guests
                              </Badge>
                              {b.preferred_zone && (
                                <Badge variant="outline" className="text-[11px]">
                                  {b.preferred_zone}
                                </Badge>
                              )}
                              {b.status === "notified" && (
                                <Badge
                                  variant="outline"
                                  className="border-violet-300 bg-violet-500/10 text-[11px] text-violet-700 dark:text-violet-300"
                                >
                                  Notified
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {b.customer_phone} · {b.booking_code} · Waiting{" "}
                              {elapsedMins}m / ~{b.quoted_wait_minutes ?? 15}m ETA
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={b.table_id ?? "unassigned"}
                            disabled={pending}
                            onValueChange={(v) => v && handleTableAssign(b.id, v)}
                          >
                            <SelectTrigger size="sm" className="w-36 text-xs">
                              <SelectValue>
                                {assignedTable ? assignedTable.code : "Pick table"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Auto match</SelectItem>
                              {tables.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.code} ({t.seats}p)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            variant="outline"
                            size="xs"
                            disabled={pending}
                            onClick={() => handleNotifyWaitlist(b)}
                          >
                            <BellRing className="mr-1 h-3 w-3 text-violet-600" />
                            Notify · WhatsApp
                          </Button>

                          <Button
                            size="xs"
                            disabled={pending}
                            onClick={() => handleSeatInPos(b)}
                          >
                            <UserCheck className="mr-1 h-3 w-3" />
                            Seat in POS
                          </Button>

                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={pending}
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleStatusChange(b.id, "no_show")}
                          >
                            Drop
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {recentWaitlistHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Recently Seated / Dropped</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border p-0">
                {recentWaitlistHistory.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between px-4 py-2.5 text-xs"
                  >
                    <span className="font-medium">
                      #{b.queue_number ?? "—"} · {b.customer_name} ({b.party_size}p)
                    </span>
                    <Badge variant="outline" className="text-[11px]">
                      {STATUS_BADGE[b.status]?.label ?? b.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Policy & Cover Charge Settings */}
        <TabsContent value="policy">
          <Card>
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle>Booking Rules &amp; Cover-Charge Deposits ({outlet?.name})</CardTitle>
              <CardDescription>
                Configure slot cadence, dining turn time, advance booking window, and optional per-guest booking deposits via Razorpay/Stripe.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSavePolicy} className="max-w-2xl space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-border p-3.5">
                  <div>
                    <div className="text-sm font-semibold">
                      Accept Online &amp; API Table Bookings
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Enables the public booking page (`/r/{slug}/book`) and `/api/bookings`.
                    </div>
                  </div>
                  <Switch
                    checked={policyEnabled}
                    onCheckedChange={setPolicyEnabled}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Slot Interval</Label>
                    <Select
                      value={policySlotMins}
                      onValueChange={(v) => v && setPolicySlotMins(v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">Every 15 mins</SelectItem>
                        <SelectItem value="30">Every 30 mins</SelectItem>
                        <SelectItem value="60">Every 60 mins</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="pol-turn">Avg Dining Turn Time (mins)</Label>
                    <Input
                      id="pol-turn"
                      type="number"
                      min={30}
                      max={360}
                      value={policyTurnMins}
                      onChange={(e) => setPolicyTurnMins(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="pol-party">Max Online Party Size</Label>
                    <Input
                      id="pol-party"
                      type="number"
                      min={1}
                      max={200}
                      value={policyMaxParty}
                      onChange={(e) => setPolicyMaxParty(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="pol-days">Max Advance Days</Label>
                    <Input
                      id="pol-days"
                      type="number"
                      min={1}
                      max={180}
                      value={policyAdvanceDays}
                      onChange={(e) => setPolicyAdvanceDays(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-3 rounded-xl border border-border/80 bg-muted/25 p-3.5 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="pol-dep">Cover Deposit per Guest (₹)</Label>
                    <Input
                      id="pol-dep"
                      type="number"
                      min={0}
                      step="10"
                      value={policyDepositPerGuest}
                      onChange={(e) => setPolicyDepositPerGuest(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Set ₹0 for free reservations. Requires Razorpay or Stripe enabled in Outlet Settings.
                    </p>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="pol-dep-min">Apply Deposit for Party ≥</Label>
                    <Input
                      id="pol-dep-min"
                      type="number"
                      min={1}
                      max={50}
                      value={policyDepositMinParty}
                      onChange={(e) => setPolicyDepositMinParty(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Use e.g. 6 to require deposits only for large groups.
                    </p>
                  </div>
                </div>

                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save Booking Policy"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Reservation / Add Walk-in Dialog */}
      <Dialog
        open={createMode !== null}
        onOpenChange={(o) => !o && setCreateMode(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {createMode === "waitlist"
                ? "Add Walk-in Party to Waitlist"
                : "New Table Reservation"}
            </DialogTitle>
            <DialogDescription>
              {createMode === "waitlist"
                ? `Estimate wait ETA automatically for ${outlet?.name}.`
                : `Automatically checks floor capacity & assigns the tightest matching table.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="bk-name">Guest Name</Label>
                <Input
                  id="bk-name"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Ramesh Naidu"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bk-phone">Mobile Number</Label>
                <Input
                  id="bk-phone"
                  required
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="9876543210"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bk-party">Guests</Label>
                <Input
                  id="bk-party"
                  type="number"
                  min={1}
                  max={200}
                  required
                  value={partySize}
                  onChange={(e) => setPartySize(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Section</Label>
                <Select
                  value={preferredZone}
                  onValueChange={(v) => v && setPreferredZone(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any area</SelectItem>
                    {zones.map((z) => (
                      <SelectItem key={z} value={z}>
                        {z}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Specific Table</Label>
                <Select
                  value={specificTableId}
                  onValueChange={(v) => v && setSpecificTableId(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto assign</SelectItem>
                    {tables.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.code} ({t.seats}p)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {createMode === "reservation" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="bk-date">Date</Label>
                  <Input
                    id="bk-date"
                    type="date"
                    required
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="bk-time">Time</Label>
                  <Input
                    id="bk-time"
                    type="time"
                    required
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="bk-email">Email (optional)</Label>
                <Input
                  id="bk-email"
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="guest@example.com"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Occasion (optional)</Label>
                <Select
                  value={occasion || "__none__"}
                  onValueChange={(v) =>
                    v && setOccasion(v === "__none__" ? "" : v)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {BOOKING_OCCASIONS.map((occ) => (
                      <SelectItem key={occ} value={occ}>
                        {occ}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="bk-notes">Special Requests</Label>
              <Input
                id="bk-notes"
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                placeholder="e.g. Window seat, baby high chair, birthday cake"
              />
            </div>

            {createMode === "reservation" &&
              (outlet?.booking_deposit_per_guest ?? 0) > 0 && (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                  <input
                    type="checkbox"
                    checked={waiveDeposit}
                    onChange={(e) => setWaiveDeposit(e.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Waive cover deposit for staff/phone booking
                </label>
              )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateMode(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Saving…"
                  : createMode === "waitlist"
                    ? "Add to Waitlist"
                    : "Confirm Reservation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
