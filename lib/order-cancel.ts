// Why an order was rejected or cancelled by the restaurant. Our own codes —
// each delivery platform has its own reason list, and its adapter maps these
// onto it.

export const CANCEL_REASONS = [
  { code: "item_out_of_stock", label: "Item out of stock" },
  { code: "kitchen_overloaded", label: "Kitchen too busy" },
  { code: "outlet_closed", label: "Outlet closed or closing" },
  { code: "customer_request", label: "Customer asked to cancel" },
  { code: "duplicate_order", label: "Duplicate or test order" },
  { code: "other", label: "Other" },
] as const;

export type CancelReasonCode = (typeof CANCEL_REASONS)[number]["code"];

export const CANCEL_NOTE_MAX = 300;

export function isCancelReason(code: string): code is CancelReasonCode {
  return CANCEL_REASONS.some((r) => r.code === code);
}

export function cancelReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return CANCEL_REASONS.find((r) => r.code === code)?.label ?? code;
}

export type CancelOrderInput = {
  reason: string;
  note?: string;
  /** Products that were out of stock (required for item_out_of_stock). */
  productIds?: string[];
  /** Also take those products off the menu until someone turns them back on. */
  markOutOfStock?: boolean;
};
