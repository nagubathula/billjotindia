// Delivery platforms ("channels") and the rules that differ between orders we
// took ourselves and orders a platform sent us.

import type { AggregatorChannel, OrderSource } from "./types";

/** Sources where the customer ordered from us directly. */
export const FIRST_PARTY_SOURCES: OrderSource[] = ["pos", "kiosk", "web"];

/**
 * Sources whose customers belong in our own customer list. Platform orders are
 * left out on purpose: the customer is the platform's, and their details are
 * shared with us only to fulfil that order. POS walk-ins have no identity.
 */
export const CUSTOMER_LIST_SOURCES: OrderSource[] = ["web", "kiosk"];

export function isAggregatorSource(
  source: string | null | undefined,
): source is AggregatorChannel {
  return !!source && !(FIRST_PARTY_SOURCES as string[]).includes(source);
}

/** Channels the admin can connect an outlet to today. */
export const CONNECTABLE_CHANNELS: AggregatorChannel[] = ["zomato", "swiggy"];

export const CHANNEL_LABEL: Record<AggregatorChannel, string> = {
  zomato: "Zomato",
  swiggy: "Swiggy",
  magicpin: "magicpin",
  dunzo: "Dunzo",
  ondc: "ONDC",
  "uber-eats": "Uber Eats",
  dotpe: "DotPe",
  other: "Other",
};

/**
 * Why an outlet is switched off on a channel. Our own codes — each platform
 * has its own list, and its adapter maps these onto it.
 */
export const OFFLINE_REASONS = [
  { code: "kitchen_overloaded", label: "Kitchen too busy" },
  { code: "staff_unavailable", label: "Not enough staff" },
  { code: "closing_early", label: "Closing early" },
  { code: "stock_out", label: "Out of key ingredients" },
  { code: "technical_issue", label: "Technical problem" },
  { code: "other", label: "Other" },
] as const;

export type OfflineReasonCode = (typeof OFFLINE_REASONS)[number]["code"];

export function offlineReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return OFFLINE_REASONS.find((r) => r.code === code)?.label ?? code;
}
