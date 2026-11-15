// Weekly opening hours, stored in outlets.opening_hours (jsonb) in the
// outlet's own timezone.
//
//   { mon: [{ open: "09:00", close: "22:00" }], tue: [], ... }
//
// An empty array is a closed day. A close time earlier than the open time
// runs past midnight ("18:00"–"02:00"). The shape allows several slots a day
// (lunch + dinner); the settings form edits one.

import { resolveTimeZone } from "@/lib/time";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAYS)[number];

export const DAY_LABEL: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export type HoursSlot = { open: string; close: string };
export type OpeningHours = Record<DayKey, HoursSlot[]>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validates untrusted input (a parsed form value or the jsonb column) into
 * OpeningHours. Returns null when it isn't a usable set of hours.
 */
export function parseOpeningHours(value: unknown): OpeningHours | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const src = value as Record<string, unknown>;
  const out = {} as OpeningHours;
  for (const day of DAYS) {
    const raw = src[day];
    if (raw === undefined) {
      out[day] = [];
      continue;
    }
    if (!Array.isArray(raw) || raw.length > 4) return null;
    const slots: HoursSlot[] = [];
    for (const s of raw) {
      if (!s || typeof s !== "object") return null;
      const { open, close } = s as Record<string, unknown>;
      if (typeof open !== "string" || typeof close !== "string") return null;
      if (!TIME_RE.test(open) || !TIME_RE.test(close) || open === close) return null;
      slots.push({ open, close });
    }
    out[day] = slots;
  }
  return out;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

export type OutletOpenCheck = {
  open: boolean;
  reason: "no_schedule" | "open" | "closed";
  nextOpen?: string;
};

/**
 * Evaluates whether an outlet is open at `now` in `timeZone`.
 * If `openingHoursRaw` is null/unconfigured, returns `{ open: true, reason: "no_schedule" }`.
 */
export function isOutletOpen(
  openingHoursRaw: unknown,
  timeZone?: string | null,
  now: Date = new Date(),
): OutletOpenCheck {
  const hours = parseOpeningHours(openingHoursRaw);
  if (!hours) {
    return { open: true, reason: "no_schedule" };
  }

  const tz = resolveTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  let weekdayShort = "Mon";
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === "weekday") weekdayShort = part.value;
    else if (part.type === "hour") hour = Number(part.value) % 24;
    else if (part.type === "minute") minute = Number(part.value);
  }

  const todayIdx = WEEKDAY_MAP[weekdayShort] ?? 0;
  const todayKey = DAYS[todayIdx];
  const yesterdayKey = DAYS[(todayIdx + 6) % 7];
  const curMin = hour * 60 + minute;

  // 1. Check yesterday's overnight spillover (e.g. 18:00–02:00)
  for (const slot of hours[yesterdayKey] ?? []) {
    const openMin = toMinutes(slot.open);
    const closeMin = toMinutes(slot.close);
    if (closeMin < openMin && curMin < closeMin) {
      return { open: true, reason: "open" };
    }
  }

  // 2. Check today's slots
  for (const slot of hours[todayKey] ?? []) {
    const openMin = toMinutes(slot.open);
    const closeMin = toMinutes(slot.close);
    if (openMin < closeMin) {
      if (curMin >= openMin && curMin < closeMin) {
        return { open: true, reason: "open" };
      }
    } else if (curMin >= openMin) {
      return { open: true, reason: "open" };
    }
  }

  // 3. Find next opening slot within the next 7 days for helpful messaging
  for (let offset = 0; offset < 7; offset++) {
    const idx = (todayIdx + offset) % 7;
    const day = DAYS[idx];
    const sorted = [...(hours[day] ?? [])].sort(
      (a, b) => toMinutes(a.open) - toMinutes(b.open),
    );
    for (const slot of sorted) {
      if (offset === 0 && toMinutes(slot.open) <= curMin) continue;
      const dayText =
        offset === 0
          ? "today"
          : offset === 1
            ? "tomorrow"
            : DAY_LABEL[day];
      return {
        open: false,
        reason: "closed",
        nextOpen: `${dayText} at ${slot.open}`,
      };
    }
  }

  return { open: false, reason: "closed" };
}
