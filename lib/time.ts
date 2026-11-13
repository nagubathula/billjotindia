// Business time.
//
// Server code runs in the host's time zone — UTC on most hosts — so "today",
// hour-of-day buckets and printed timestamps have to name the outlet's zone
// explicitly. Date's local-time methods (setHours, getHours, a bare
// toLocaleString) silently use the host's zone and put the day boundary at
// 05:30 IST on a UTC machine.

export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/** A usable IANA zone: the given one if valid, otherwise the default. */
export function resolveTimeZone(timeZone?: string | null): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

/** What a clock on the wall in `timeZone` shows at `instant`. */
function wallClock(instant: Date, timeZone: string): WallClock {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, fmt);
  }
  const out: Record<string, number> = {};
  for (const part of fmt.formatToParts(instant)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out as WallClock;
}

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant a calendar day begins in `timeZone`: the day containing `date`,
 * moved by `dayOffset` whole days (-1 = yesterday, 1 = tomorrow).
 */
export function startOfDay(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
  dayOffset = 0,
): Date {
  const w = wallClock(date, timeZone);
  const wallMidnight = Date.UTC(w.year, w.month - 1, w.day + dayOffset);
  // The offset is read at a first guess, then again at the result, so a zone
  // that changes its offset between the two still lands on its own midnight.
  let instant = wallMidnight - offsetMs(new Date(wallMidnight), timeZone);
  instant = wallMidnight - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Hour of the day (0–23) at `date` in `timeZone`. */
export function hourOfDay(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): number {
  return wallClock(date, timeZone).hour;
}

/** `YYYY-MM-DD` for the calendar day containing `date` in `timeZone`. */
export function dayKey(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const w = wallClock(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}
