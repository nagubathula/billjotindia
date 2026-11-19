"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BellRing,
  CalendarClock,
  MessageCircle,
  MonitorSmartphone,
  Plus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  createStaffBookingAction,
  seatBookingInPosAction,
  updateBookingStatusAction,
} from "@/app/r/[slug]/admin/bookings/actions";
import {
  buildBookingWhatsAppUrl,
  formatShortClockTime,
  parseOutletFloorTables,
  wallClockDateTimeToIso,
} from "@/lib/bookings";
import { cn } from "@/lib/utils";
import type { TableBooking } from "@/lib/types";

export function PosHostDeskDialog({
  open,
  onOpenChange,
  restaurantSlug,
  restaurantName,
  outletId,
  outletTimeZone,
  bookings,
  tables,
  canTakePayment,
  onSeated,
  onBookingsUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantSlug: string;
  restaurantName: string;
  outletId: string;
  outletTimeZone: string;
  bookings: TableBooking[];
  tables: Array<{ id: string; name: string }>;
  canTakePayment: boolean;
  onSeated: (params: {
    booking: TableBooking;
    tableId: string | null;
    applyDeposit: number;
  }) => void;
  onBookingsUpdated: (updater: (prev: TableBooking[]) => TableBooking[]) => void;
}) {
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"reservations" | "waitlist" | "add">(
    "reservations",
  );
  const [err, setErr] = useState<string | null>(null);

  // Controlled quick-add fields
  const [addMode, setAddMode] = useState<"waitlist" | "reservation">("waitlist");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [preferredZone, setPreferredZone] = useState("any");
  const [dateStr, setDateStr] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: outletTimeZone }).format(
      new Date(),
    ),
  );
  const [timeStr, setTimeStr] = useState("19:30");
  const [notes, setNotes] = useState("");

  const floorTables = useMemo(() => parseOutletFloorTables(tables), [tables]);
  const tableById = useMemo(
    () => new Map(floorTables.map((t) => [t.id, t])),
    [floorTables],
  );
  const zones = useMemo(
    () => [...new Set(floorTables.map((t) => t.zone))].sort(),
    [floorTables],
  );

  const reservations = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            b.booking_type === "reservation" &&
            b.status !== "cancelled" &&
            b.status !== "completed" &&
            b.status !== "no_show",
        )
        .sort(
          (a, b) =>
            new Date(a.reserved_for).getTime() -
            new Date(b.reserved_for).getTime(),
        ),
    [bookings],
  );

  const waitlist = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            b.booking_type === "waitlist" &&
            (b.status === "waitlisted" || b.status === "notified"),
        )
        .sort((a, b) => (a.queue_number ?? 999) - (b.queue_number ?? 999)),
    [bookings],
  );

  function handleSeat(b: TableBooking) {
    setErr(null);
    start(async () => {
      const res = await seatBookingInPosAction(restaurantSlug, b.id);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onBookingsUpdated((prev) =>
        prev.map((item) => (item.id === b.id ? res.booking : item)),
      );
      const depositCredit =
        canTakePayment &&
        res.booking.deposit_status === "paid" &&
        Number(res.booking.deposit_amount ?? 0) > 0
          ? Number(res.booking.deposit_amount)
          : 0;
      onSeated({
        booking: res.booking,
        tableId: res.booking.table_id,
        applyDeposit: depositCredit,
      });
      onOpenChange(false);
    });
  }

  function handleNotify(b: TableBooking) {
    setErr(null);
    const assigned = b.table_id ? tableById.get(b.table_id)?.code : null;
    const waUrl = buildBookingWhatsAppUrl({
      phone: b.customer_phone,
      customerName: b.customer_name,
      restaurantName,
      bookingCode: b.booking_code,
      kind: "waitlist_ready",
      partySize: b.party_size,
      tableCode: assigned,
      timeZone: outletTimeZone,
    });
    start(async () => {
      const res = await updateBookingStatusAction(
        restaurantSlug,
        b.id,
        "notified",
      );
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onBookingsUpdated((prev) =>
        prev.map((item) => (item.id === b.id ? res.booking : item)),
      );
      if (waUrl && typeof window !== "undefined") {
        window.open(waUrl, "_blank", "noopener,noreferrer");
      }
    });
  }

  function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    let reservedForIso: string | undefined;
    if (addMode === "reservation") {
      const iso = wallClockDateTimeToIso(dateStr, timeStr, outletTimeZone);
      if (!iso) {
        setErr("Enter a valid date and time.");
        return;
      }
      reservedForIso = iso;
    }

    start(async () => {
      const res = await createStaffBookingAction(restaurantSlug, {
        outletId,
        bookingType: addMode,
        source: "pos",
        customerName: guestName,
        customerPhone: guestPhone,
        partySize: Number(partySize) || 2,
        preferredZone: preferredZone === "any" ? undefined : preferredZone,
        specialRequests: notes || undefined,
        reservedForIso,
        waiveDeposit: true,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onBookingsUpdated((prev) => [...prev, res.booking]);
      setGuestName("");
      setGuestPhone("");
      setPartySize("2");
      setNotes("");
      setTab(addMode === "waitlist" ? "waitlist" : "reservations");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            Host Desk · Reservations &amp; Walk-in Waitlist
          </DialogTitle>
          <DialogDescription>
            Seat arriving reservations into open table tabs, apply paid deposits, or manage the live walk-in queue.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-2.5">
          <button
            type="button"
            onClick={() => setTab("reservations")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "reservations"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            Reservations ({reservations.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("waitlist")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "waitlist"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            Waitlist Queue ({waitlist.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("add")}
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "add"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Walk-in / Booking
          </button>
        </div>

        {err && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </div>
        )}

        {tab === "reservations" && (
          <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {reservations.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted-foreground">
                No active reservations coming up right now.
              </p>
            ) : (
              reservations.map((b) => {
                const tbl = b.table_id ? tableById.get(b.table_id) : null;
                const depositPaid =
                  b.deposit_status === "paid" && Number(b.deposit_amount ?? 0) > 0;
                return (
                  <div
                    key={b.id}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-semibold">
                          {formatShortClockTime(b.reserved_for, outletTimeZone)}
                        </span>
                        <span className="font-semibold text-sm text-foreground">
                          {b.customer_name}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {b.party_size}p
                        </Badge>
                        {tbl && (
                          <Badge variant="outline" className="border-blue-300 bg-blue-500/10 text-[10px] text-blue-700">
                            {tbl.code}
                          </Badge>
                        )}
                        {b.status === "seated" && (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-500/10 text-[10px] text-emerald-700">
                            Seated
                          </Badge>
                        )}
                        {depositPaid && (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-500/10 text-[10px] text-emerald-700">
                            ₹{Number(b.deposit_amount).toFixed(0)} Deposit Paid
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {b.booking_code} · {b.customer_phone}
                        {b.preferred_zone ? ` · ${b.preferred_zone}` : ""}
                        {b.occasion ? ` · ${b.occasion}` : ""}
                      </div>
                      {b.special_requests && (
                        <div className="text-[11px] text-amber-700">
                          Note: {b.special_requests}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="xs"
                        disabled={pending}
                        onClick={() => handleSeat(b)}
                      >
                        <MonitorSmartphone className="mr-1 h-3 w-3" />
                        {b.status === "seated" ? "Open Table" : "Seat & Open Table"}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "waitlist" && (
          <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {waitlist.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted-foreground">
                Walk-in waitlist is empty.
              </p>
            ) : (
              waitlist.map((b) => {
                const tbl = b.table_id ? tableById.get(b.table_id) : null;
                const waUrl = buildBookingWhatsAppUrl({
                  phone: b.customer_phone,
                  customerName: b.customer_name,
                  restaurantName,
                  bookingCode: b.booking_code,
                  kind: "waitlist_ready",
                  partySize: b.party_size,
                  tableCode: tbl?.code,
                  timeZone: outletTimeZone,
                });
                return (
                  <div
                    key={b.id}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 font-mono text-xs font-bold text-amber-800">
                        #{b.queue_number ?? "—"}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm">
                            {b.customer_name}
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {b.party_size}p
                          </Badge>
                          {b.status === "notified" && (
                            <Badge variant="outline" className="border-violet-300 bg-violet-500/10 text-[10px] text-violet-700">
                              Notified
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {b.customer_phone} · ~{b.quoted_wait_minutes ?? 15}m quote
                          {b.preferred_zone ? ` · ${b.preferred_zone}` : ""}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {waUrl ? (
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={pending}
                          onClick={() => handleNotify(b)}
                        >
                          <BellRing className="mr-1 h-3 w-3 text-violet-600" />
                          Ready (WA)
                        </Button>
                      ) : (
                        <a
                          href={`tel:${b.customer_phone}`}
                          className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
                        >
                          <MessageCircle className="mr-1 h-3 w-3" />
                          Call
                        </a>
                      )}
                      <Button
                        size="xs"
                        disabled={pending}
                        onClick={() => handleSeat(b)}
                      >
                        <Users className="mr-1 h-3 w-3" />
                        Seat Party
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "add" && (
          <form onSubmit={handleQuickAdd} className="grid gap-3 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAddMode("waitlist")}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium",
                  addMode === "waitlist"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                Walk-in Waitlist
              </button>
              <button
                type="button"
                onClick={() => setAddMode("reservation")}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium",
                  addMode === "reservation"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                Scheduled Booking
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="pos-bk-name" className="text-xs">
                  Guest Name
                </Label>
                <Input
                  id="pos-bk-name"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Guest name"
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="pos-bk-phone" className="text-xs">
                  Phone Number
                </Label>
                <Input
                  id="pos-bk-phone"
                  required
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="9876543210"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="pos-bk-party" className="text-xs">
                  Party Size
                </Label>
                <Input
                  id="pos-bk-party"
                  type="number"
                  min={1}
                  max={200}
                  required
                  value={partySize}
                  onChange={(e) => setPartySize(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Preferred Section</Label>
                <Select
                  value={preferredZone}
                  onValueChange={(v) => v && setPreferredZone(v)}
                >
                  <SelectTrigger size="sm" className="w-full text-xs">
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
            </div>

            {addMode === "reservation" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="pos-bk-date" className="text-xs">
                    Date
                  </Label>
                  <Input
                    id="pos-bk-date"
                    type="date"
                    required
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="pos-bk-time" className="text-xs">
                    Time
                  </Label>
                  <Input
                    id="pos-bk-time"
                    type="time"
                    required
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}

            <div className="grid gap-1">
              <Label htmlFor="pos-bk-notes" className="text-xs">
                Notes (optional)
              </Label>
              <Input
                id="pos-bk-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="High chair, outdoor table, celebration…"
                className="h-8 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTab("reservations")}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending
                  ? "Saving…"
                  : addMode === "waitlist"
                    ? "Join Queue"
                    : "Save Booking"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
