// Weekly opening hours, stored in outlets.opening_hours (jsonb) in the
// outlet's own timezone.
//
//   { mon: [{ open: "09:00", close: "22:00" }], tue: [], ... }
//
// An empty array is a closed day. A close time earlier than the open time
// runs past midnight ("18:00"–"02:00"). The shape allows several slots a day
// (lunch + dinner); the settings form edits one.

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
