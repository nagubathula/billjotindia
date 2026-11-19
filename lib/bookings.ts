import { randomInt } from "node:crypto";
import { DAYS, parseOpeningHours, type DayKey } from "@/lib/opening-hours";
import { parseTableName } from "@/lib/tables";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@/lib/time";

export const BOOKING_OCCASIONS = [
  "Birthday",
  "Anniversary",
  "Family Dinner",
  "Business Lunch",
  "Date Night",
  "Group Party",
] as const;

export type FloorTableInfo = {
  id: string;
  rawName: string;
  code: string;
  zone: string;
  seats: number;
};

export type BookingScheduleRow = {
  id?: string;
  outlet_id?: string;
  table_id?: string | null;
  booking_type?: string | null;
  status?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  party_size: number;
  preferred_zone?: string | null;
  reserved_for: string;
  duration_minutes?: number | null;
  quoted_wait_minutes?: number | null;
  queue_number?: number | null;
  deposit_amount?: number | null;
  deposit_status?: string | null;
  created_at?: string | null;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PENDING_PAYMENT_HOLD_MS = 20 * 60 * 1000;
const UNCONFIGURED_FLOOR_COVER_CAP = 40;

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function generateBookingCode(type: "reservation" | "waitlist"): string {
  const prefix = type === "waitlist" ? "WL" : "RES";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `${prefix}-${suffix}`;
}

export function computeBookingDeposit(
  partySize: number,
  depositPerGuest: number,
  depositMinParty = 1,
): number {
  const guests = Math.max(0, Math.floor(Number(partySize) || 0));
  const rate = Math.max(0, Number(depositPerGuest) || 0);
  const minParty = Math.max(1, Math.floor(Number(depositMinParty) || 1));
  if (guests < minParty || rate <= 0) return 0;
  return round2(guests * rate);
}

export function isBlockingReservation(
  booking: Pick<
    BookingScheduleRow,
    "booking_type" | "status" | "created_at"
  >,
  nowMs = Date.now(),
): boolean {
  if ((booking.booking_type ?? "reservation") !== "reservation") return false;
  const st = booking.status ?? "";
  if (st === "confirmed" || st === "seated" || st === "pending") return true;
  if (st === "pending_payment") {
    const createdMs = booking.created_at
      ? new Date(booking.created_at).getTime()
      : nowMs;
    return Number.isFinite(createdMs) && nowMs - createdMs < PENDING_PAYMENT_HOLD_MS;
  }
  return false;
}

export function intervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
}

export function parseOutletFloorTables(
  tabs: Array<{ id: string; name: string }>,
): FloorTableInfo[] {
  const out: FloorTableInfo[] = [];
  for (const t of tabs) {
    const trimmed = t.name.trim();
    if (!trimmed || trimmed.toLowerCase() === "counter") continue;
    const parsed = parseTableName(trimmed);
    out.push({
      id: t.id,
      rawName: trimmed,
      code: parsed.code,
      zone: parsed.zone,
      seats: Math.max(1, parsed.seats || 4),
    });
  }
  return out;
}

export function checkSlotAvailability(params: {
  tables: FloorTableInfo[];
  bookings: BookingScheduleRow[];
  slotStartMs: number;
  durationMinutes: number;
  partySize: number;
  preferredZone?: string | null;
  specificTableId?: string | null;
  excludeBookingId?: string;
  nowMs?: number;
}): {
  available: boolean;
  suggestedTableId: string | null;
  remainingTables: number;
  reason?: string;
} {
  const {
    tables,
    bookings,
    slotStartMs,
    durationMinutes,
    partySize,
    preferredZone,
    specificTableId,
    excludeBookingId,
    nowMs = Date.now(),
  } = params;

  const durMs = Math.max(15, durationMinutes || 90) * 60_000;
  const slotEndMs = slotStartMs + durMs;

  const overlapping = bookings.filter((b) => {
    if (excludeBookingId && b.id === excludeBookingId) return false;
    if (!isBlockingReservation(b, nowMs)) return false;
    const bStart = new Date(b.reserved_for).getTime();
    if (!Number.isFinite(bStart)) return false;
    const bDurMs = Math.max(15, Number(b.duration_minutes ?? 90)) * 60_000;
    return intervalsOverlap(slotStartMs, slotEndMs, bStart, bStart + bDurMs);
  });

  if (specificTableId) {
    const table = tables.find((t) => t.id === specificTableId);
    if (!table) {
      return {
        available: false,
        suggestedTableId: null,
        remainingTables: 0,
        reason: "Selected table was not found at this outlet",
      };
    }
    const conflict = overlapping.find((b) => b.table_id === specificTableId);
    if (conflict) {
      return {
        available: false,
        suggestedTableId: null,
        remainingTables: 0,
        reason: `Table ${table.code} already has a booking at that time`,
      };
    }
    return {
      available: true,
      suggestedTableId: specificTableId,
      remainingTables: 1,
    };
  }

  // Fallback cover-pool check when an outlet hasn't configured physical tables yet
  if (tables.length === 0) {
    const usedCovers = overlapping.reduce(
      (s, b) => s + Math.max(1, Number(b.party_size) || 1),
      0,
    );
    if (usedCovers + partySize > UNCONFIGURED_FLOOR_COVER_CAP) {
      return {
        available: false,
        suggestedTableId: null,
        remainingTables: 0,
        reason: "Selected time slot is fully booked",
      };
    }
    return {
      available: true,
      suggestedTableId: null,
      remainingTables: Math.max(
        1,
        Math.floor(
          (UNCONFIGURED_FLOOR_COVER_CAP - usedCovers) / Math.max(1, partySize),
        ),
      ),
    };
  }

  const busyTableIds = new Set(
    overlapping.map((b) => b.table_id).filter((id): id is string => Boolean(id)),
  );
  const remainingPool = tables
    .filter((t) => !busyTableIds.has(t.id))
    .sort((a, b) => a.seats - b.seats || a.code.localeCompare(b.code));

  const targetZoneNorm = preferredZone?.trim().toLowerCase() || "";

  // Account for overlapping unassigned reservations before checking remaining free tables
  const unassigned = overlapping
    .filter((b) => !b.table_id)
    .sort((a, b) => {
      const aHasZone = a.preferred_zone ? 1 : 0;
      const bHasZone = b.preferred_zone ? 1 : 0;
      if (aHasZone !== bHasZone) return bHasZone - aHasZone;
      return b.party_size - a.party_size;
    });

  for (const ub of unassigned) {
    const ubZone = ub.preferred_zone?.trim().toLowerCase() || "";
    const fitIdx = remainingPool.findIndex((t) => {
      if (t.seats < ub.party_size) return false;
      if (ubZone && t.zone.toLowerCase() !== ubZone) return false;
      return true;
    });
    if (fitIdx >= 0) {
      remainingPool.splice(fitIdx, 1);
    } else {
      // Fallback: consume any fitting free table if exact preferred zone wasn't free
      const fallbackIdx = remainingPool.findIndex((t) => t.seats >= ub.party_size);
      if (fallbackIdx >= 0) remainingPool.splice(fallbackIdx, 1);
    }
  }

  const candidates = remainingPool.filter((t) => {
    if (t.seats < partySize) return false;
    if (targetZoneNorm && t.zone.toLowerCase() !== targetZoneNorm) return false;
    return true;
  });

  if (candidates.length === 0) {
    return {
      available: false,
      suggestedTableId: null,
      remainingTables: 0,
      reason: preferredZone
        ? `No ${preferredZone} tables available for ${partySize} guests at that time`
        : `No tables available for ${partySize} guests at that time`,
    };
  }

  return {
    available: true,
    suggestedTableId: candidates[0].id,
    remainingTables: candidates.length,
  };
}

export const findBestAvailableTable = checkSlotAvailability;

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function wallClockToMs(
  dateStr: string,
  minutesFromMidnight: number,
  timeZone: string,
): number | null {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const extraDays = Math.floor(minutesFromMidnight / 1440);
  const remMin = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const hour = Math.floor(remMin / 60);
  const minute = remMin % 60;

  const guessUtc = Date.UTC(year, month - 1, day + extraDays, hour, minute, 0);

  const offsetAt = (instantMs: number) => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const out: Record<string, number> = {};
    for (const part of fmt.formatToParts(new Date(instantMs))) {
      if (part.type !== "literal") out[part.type] = Number(part.value);
    }
    const asUtc = Date.UTC(
      out.year,
      out.month - 1,
      out.day,
      out.hour,
      out.minute,
      out.second,
    );
    return asUtc - Math.floor(instantMs / 1000) * 1000;
  };

  let instant = guessUtc - offsetAt(guessUtc);
  instant = guessUtc - offsetAt(instant);
  return instant;
}

export function wallClockDateTimeToIso(
  dateStr: string,
  hhmm: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): string | null {
  const m = hhmm.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  const ms = wallClockToMs(dateStr, mins, resolveTimeZone(timeZone));
  return ms === null ? null : new Date(ms).toISOString();
}

function dayKeyForDateStr(dateStr: string, timeZone: string): DayKey {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "mon";
  const noonUtc = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0),
  );
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(noonUtc);
  const idx = WEEKDAY_MAP[weekday] ?? 0;
  return DAYS[idx];
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatSlotLabel(minutesFromMidnight: number): {
  time: string;
  label: string;
} {
  const norm = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const h24 = Math.floor(norm / 60);
  const m = norm % 60;
  const time = `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  const label = `${h12}:${String(m).padStart(2, "0")} ${period}`;
  return { time, label };
}

export type BookingSlotOption = {
  time: string;
  label: string;
  iso: string;
  available: boolean;
  remainingTables: number;
};

export function generateAvailableSlotsForDate(params: {
  dateStr: string;
  timeZone?: string | null;
  openingHours: unknown;
  slotMinutes?: number;
  turnMinutes?: number;
  partySize: number;
  preferredZone?: string | null;
  tables: FloorTableInfo[];
  bookings: BookingScheduleRow[];
  nowMs?: number;
}): BookingSlotOption[] {
  const tz = resolveTimeZone(params.timeZone ?? DEFAULT_TIME_ZONE);
  const slotStep = [15, 30, 60].includes(Number(params.slotMinutes))
    ? Number(params.slotMinutes)
    : 30;
  const turnMinutes = Math.max(30, Number(params.turnMinutes ?? 90));
  const nowMs = params.nowMs ?? Date.now();
  const cutoffMs = nowMs + 15 * 60_000;

  const parsedHours = parseOpeningHours(params.openingHours);
  const windows = parsedHours
    ? parsedHours[dayKeyForDateStr(params.dateStr, tz)] ?? []
    : [{ open: "11:00", close: "22:30" }];

  if (windows.length === 0) return [];

  const seenTimes = new Set<string>();
  const slots: BookingSlotOption[] = [];

  for (const w of windows) {
    const openMin = toMinutes(w.open);
    let closeMin = toMinutes(w.close);
    if (closeMin <= openMin) closeMin += 24 * 60;
    const lastStart = closeMin - 30;

    for (let min = openMin; min <= lastStart; min += slotStep) {
      const slotStartMs = wallClockToMs(params.dateStr, min, tz);
      if (slotStartMs === null) continue;
      const { time, label } = formatSlotLabel(min);
      if (seenTimes.has(time)) continue;
      seenTimes.add(time);

      if (slotStartMs < cutoffMs) {
        slots.push({
          time,
          label,
          iso: new Date(slotStartMs).toISOString(),
          available: false,
          remainingTables: 0,
        });
        continue;
      }

      const check = checkSlotAvailability({
        tables: params.tables,
        bookings: params.bookings,
        slotStartMs,
        durationMinutes: turnMinutes,
        partySize: params.partySize,
        preferredZone: params.preferredZone,
        nowMs,
      });

      slots.push({
        time,
        label,
        iso: new Date(slotStartMs).toISOString(),
        available: check.available,
        remainingTables: check.remainingTables,
      });
    }
  }

  return slots;
}

export function estimateWaitlistMinutes(params: {
  activeWaitlistCount: number;
  partySize: number;
  totalTablesCount: number;
}): number {
  const ahead = Math.max(0, Math.floor(Number(params.activeWaitlistCount) || 0));
  const tables = Math.max(1, Math.floor(Number(params.totalTablesCount) || 6));
  const baseMins = 10 + Math.round((ahead * 45) / tables);
  const partyBump = params.partySize >= 6 ? 10 : params.partySize >= 4 ? 5 : 0;
  return Math.min(120, Math.max(10, baseMins + partyBump));
}

export function getUpcomingReservationForTable<
  T extends Pick<
    BookingScheduleRow,
    | "table_id"
    | "booking_type"
    | "status"
    | "customer_name"
    | "party_size"
    | "reserved_for"
  >,
>(
  tableId: string,
  bookings: T[],
  nowMs = Date.now(),
): { booking: T; minutesUntil: number } | null {
  const earliestMs = nowMs - 30 * 60_000;
  const latestMs = nowMs + 120 * 60_000;
  let best: { booking: T; minutesUntil: number; startMs: number } | null = null;

  for (const b of bookings) {
    if (b.table_id !== tableId) continue;
    if ((b.booking_type ?? "reservation") !== "reservation") continue;
    if (
      b.status !== "confirmed" &&
      b.status !== "pending" &&
      b.status !== "notified"
    ) {
      continue;
    }
    const startMs = new Date(b.reserved_for).getTime();
    if (!Number.isFinite(startMs) || startMs < earliestMs || startMs > latestMs) {
      continue;
    }
    if (!best || startMs < best.startMs) {
      best = {
        booking: b,
        minutesUntil: Math.round((startMs - nowMs) / 60_000),
        startMs,
      };
    }
  }

  return best ? { booking: best.booking, minutesUntil: best.minutesUntil } : null;
}

export function normalizeWhatsAppPhone(phone: string): string | null {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export function formatBookingTime(
  isoOrMs: string | number,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: resolveTimeZone(timeZone),
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function formatShortClockTime(
  isoOrMs: string | number,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: resolveTimeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function buildBookingWhatsAppUrl(params: {
  phone: string;
  customerName: string;
  restaurantName: string;
  bookingCode: string;
  kind: "confirmed" | "waitlist_ready" | "reminder";
  reservedFor?: string;
  partySize: number;
  tableCode?: string | null;
  timeZone?: string | null;
}): string | null {
  const waPhone = normalizeWhatsAppPhone(params.phone);
  if (!waPhone) return null;

  const when = params.reservedFor
    ? formatBookingTime(params.reservedFor, resolveTimeZone(params.timeZone))
    : "";
  const tableText = params.tableCode ? ` (Table ${params.tableCode})` : "";

  let text = "";
  if (params.kind === "waitlist_ready") {
    text = `Hi ${params.customerName}, your table for ${params.partySize} at ${params.restaurantName}${tableText} is ready! Please check in at the host desk with token ${params.bookingCode}.`;
  } else if (params.kind === "reminder") {
    text = `Reminder from ${params.restaurantName}: looking forward to hosting ${params.customerName} (party of ${params.partySize}) on ${when}${tableText}. Booking code: ${params.bookingCode}.`;
  } else {
    text = `Booking confirmed at ${params.restaurantName}! Name: ${params.customerName} · ${params.partySize} guests · ${when}${tableText} · Code: ${params.bookingCode}.`;
  }

  return `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
}
