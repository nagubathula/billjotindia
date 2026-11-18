// First-party order pricing, shared by the order API and the POS's
// "Send KOT" action so both price and validate orders the same way: every
// line is re-priced from the outlet's active menu, add-ons are checked
// against what each product offers, and GST is split out of the inclusive
// prices. Moved here unchanged from app/api/orders/route.ts.

import { randomInt } from "node:crypto";
import { resolveOrderCouponDiscount } from "@/lib/coupons";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { OrderType } from "@/lib/types";
import { isUuid } from "@/lib/utils";
import type { Json } from "@/lib/database.types";

export const ORDER_TYPES = ["dine-in", "takeaway", "delivery"] as const;

export function isOrderType(value: unknown): value is OrderType {
  return (
    typeof value === "string" &&
    (ORDER_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Resolves a real `pos_tabs.id` for `orders.table_id` on dine-in orders,
 * accepting either a verified `tableId` UUID or a table code (`"T-07"` /
 * `"T-07 · Guest"`). Returns null if no matching table exists in `outletId`.
 */
export async function resolveTableForOrder(
  supabase: ReturnType<typeof createAdminClient>,
  outletId: string,
  opts: {
    tableId?: unknown;
    tableCode?: unknown;
    customerName?: unknown;
  },
): Promise<string | null> {
  if (isUuid(opts.tableId)) {
    const { data } = await supabase
      .from("pos_tabs")
      .select("id")
      .eq("id", opts.tableId)
      .eq("outlet_id", outletId)
      .maybeSingle();
    return data?.id ?? null;
  }

  let candidate =
    typeof opts.tableCode === "string" ? opts.tableCode.trim() : "";
  if (!candidate && typeof opts.customerName === "string") {
    const raw = opts.customerName.trim();
    if (raw.includes("·")) {
      candidate = raw.split("·")[0].trim();
    } else if (/^[a-z]{1,4}[- ]?\d{1,4}$/i.test(raw)) {
      candidate = raw;
    }
  }
  if (!candidate) return null;

  const needle = candidate.toLowerCase();
  const { data: tabs } = await supabase
    .from("pos_tabs")
    .select("id, name")
    .eq("outlet_id", outletId);
  if (!tabs) return null;

  for (const t of tabs) {
    const code = t.name.split("·")[0].trim().toLowerCase();
    if (code === needle) return t.id;
  }
  return null;
}

export type OrderItemInput = {
  product_config: Json;
  quantity: number;
  unit_price: number;
  total_price: number;
  // Optional — what the customer asked for on this item ("no onion").
  instructions?: string;
};

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// Free text from customers ends up on kitchen tickets: trim it, cap it, and
// treat blank as absent.
export const ORDER_NOTE_MAX = 500;
export const ITEM_NOTE_MAX = 200;
export function cleanNote(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, max);
  return text || null;
}

// Millisecond timestamps alone repeat when two orders land together; the
// suffix keeps the number unique without making it much longer to read out.
export function newOrderNumber() {
  const suffix = randomInt(36 ** 3).toString(36).toUpperCase().padStart(3, "0");
  return `BJ-${Date.now()}-${suffix}`;
}

export type SelectedOptionInput = {
  group_id?: string;
  group_name?: string;
  option_id?: string;
  option_name?: string;
  price?: number;
};

export type ConfigShape = {
  product_id?: string;
  name?: string;
  selected_options?: SelectedOptionInput[];
};

export type Totals = {
  items: Array<{
    product_config: Json;
    quantity: number;
    unit_price: number;
    total_price: number;
    instructions: string | null;
  }>;
  subtotal: number;
  cgst: number;
  sgst: number;
  gst_paid_by_operator: boolean;
  takeaway_charges: number;
  discount_amount: number;
  rounding_amount: number;
  total_amount: number;
};


// GST-inclusive helper: the rate is baked into the price (typical Indian QSR).
export function splitGst(lineTotal: number, ratePct: number) {
  const rate = (Number(ratePct) || 0) / 100;
  return lineTotal - lineTotal / (1 + rate);
}

export function configOf(item: OrderItemInput | null | undefined): ConfigShape {
  const cfg = item?.product_config;
  return cfg && typeof cfg === "object" && !Array.isArray(cfg)
    ? (cfg as ConfigShape)
    : {};
}

export type Recomputed =
  | { ok: true; totals: Totals }
  | { ok: false; error: string; status: 400 | 500 };

export async function recomputeFirstParty(
  supabase: ReturnType<typeof createAdminClient>,
  outletId: string,
  items: OrderItemInput[],
  takeawayCharges: number,
  discountAmount = 0,
  roundingAmount = 0,
  couponCode?: string | null,
): Promise<Recomputed> {
  const invalid = (error: string): Recomputed => ({ ok: false, error, status: 400 });
  const unreadable: Recomputed = {
    ok: false,
    error: "Couldn't read the menu. Try again.",
    status: 500,
  };

  const configs = items.map(configOf);
  const productIds = [
    ...new Set(configs.map((c) => c.product_id).filter(isUuid)),
  ];
  if (productIds.length === 0) return invalid("No valid products");

  // Only this outlet's active products — prevents cross-outlet price spoofing.
  // Alongside them, the add-on groups each product is linked to.
  const [productsRes, linksRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, price, gst_rate, hsn_code, status")
      .eq("outlet_id", outletId)
      .in("id", productIds),
    supabase
      .from("product_customizations")
      .select("product_id, group_id")
      .in("product_id", productIds),
  ]);
  if (productsRes.error || linksRes.error) return unreadable;
  const prodById = new Map(productsRes.data.map((p) => [p.id, p]));

  // What each linked group allows. Switched-off groups and options are left
  // out, exactly as the pickers leave them out, so they can be neither chosen
  // nor demanded.
  type Group = {
    id: string;
    label: string;
    single: boolean;
    required: boolean;
    hasOptions: boolean;
  };
  const groupById = new Map<string, Group>();
  const optById = new Map<
    string,
    { id: string; name: string; price: number; group_id: string }
  >();
  const linkedGroupIds = [...new Set(linksRes.data.map((l) => l.group_id))];
  if (linkedGroupIds.length > 0) {
    const [groupsRes, optsRes] = await Promise.all([
      supabase
        .from("customization_groups")
        .select("id, name, display_name, selection_type, is_required")
        .in("id", linkedGroupIds)
        .eq("status", "active"),
      supabase
        .from("customization_options")
        .select("id, name, price, group_id")
        .in("group_id", linkedGroupIds)
        .eq("status", "active"),
    ]);
    if (groupsRes.error || optsRes.error) return unreadable;
    for (const g of groupsRes.data) {
      groupById.set(g.id, {
        id: g.id,
        label: g.display_name || g.name,
        single: g.selection_type === "single",
        required: !!g.is_required,
        hasOptions: false,
      });
    }
    for (const o of optsRes.data) {
      const group = groupById.get(o.group_id);
      if (!group) continue;
      group.hasOptions = true;
      optById.set(o.id, o);
    }
  }
  const groupsByProduct = new Map<string, Group[]>();
  for (const link of linksRes.data) {
    const group = groupById.get(link.group_id);
    if (!group) continue;
    const list = groupsByProduct.get(link.product_id) ?? [];
    list.push(group);
    groupsByProduct.set(link.product_id, list);
  }

  let runningTotal = 0;
  let runningGst = 0;
  const outItems: Totals["items"] = [];

  for (let i = 0; i < items.length; i++) {
    const cfg = configs[i];
    const product = cfg.product_id ? prodById.get(cfg.product_id) : undefined;
    if (!product || product.status !== "active") {
      return invalid(`"${cfg.name ?? cfg.product_id}" is unavailable at this outlet`);
    }
    const qty = Math.max(1, Math.floor(Number(items[i].quantity) || 0));

    // Every chosen add-on must be one this product offers, at most once, and
    // each group's own rules must hold: one choice in a pick-one group, at
    // least one in a required group.
    const offered = groupsByProduct.get(product.id) ?? [];
    const pickedPerGroup = new Map<string, number>();
    const seenOptions = new Set<string>();
    let optionSum = 0;
    const cleanOptions = [];
    const selections = Array.isArray(cfg.selected_options)
      ? cfg.selected_options
      : [];
    for (const sel of selections) {
      const opt = isUuid(sel?.option_id) ? optById.get(sel.option_id) : undefined;
      const group = opt ? offered.find((g) => g.id === opt.group_id) : undefined;
      if (!opt || !group) {
        return invalid(`Invalid option on "${product.name}"`);
      }
      if (seenOptions.has(opt.id)) {
        return invalid(`"${opt.name}" is on "${product.name}" twice`);
      }
      seenOptions.add(opt.id);
      pickedPerGroup.set(group.id, (pickedPerGroup.get(group.id) ?? 0) + 1);
      optionSum += Number(opt.price) || 0;
      cleanOptions.push({
        group_id: group.id,
        group_name: group.label,
        option_id: opt.id,
        option_name: opt.name,
        price: Number(opt.price) || 0,
      });
    }
    for (const group of offered) {
      const picked = pickedPerGroup.get(group.id) ?? 0;
      if (group.single && picked > 1) {
        return invalid(`Choose only one "${group.label}" for "${product.name}"`);
      }
      if (group.required && group.hasOptions && picked === 0) {
        return invalid(`Choose "${group.label}" for "${product.name}"`);
      }
    }

    const base = Number(product.price) || 0;
    const unit = base + optionSum;
    const lineTotal = unit * qty;
    runningTotal += lineTotal;
    runningGst += splitGst(lineTotal, Number(product.gst_rate ?? 5));

    outItems.push({
      quantity: qty,
      unit_price: round2(unit),
      total_price: round2(lineTotal),
      instructions: cleanNote(items[i].instructions, ITEM_NOTE_MAX),
      product_config: {
        product_id: product.id,
        name: product.name,
        base_price: base,
        gst_rate: Number(product.gst_rate ?? 5),
        hsn_code: product.hsn_code ?? null,
        selected_options: cleanOptions,
      } as Json,
    });
  }

  const packing = Math.max(0, Number(takeawayCharges) || 0);
  const effectiveDiscount =
    discountAmount > 0
      ? discountAmount
      : await resolveOrderCouponDiscount(
          supabase,
          outletId,
          couponCode,
          runningTotal,
          "storefront",
        );
  const discount = Math.min(
    runningTotal,
    Math.max(0, round2(Number(effectiveDiscount) || 0)),
  );
  const rounding = Math.max(-1, Math.min(1, round2(Number(roundingAmount) || 0)));
  const netBeforeRound = Math.max(0, runningTotal + packing - discount);
  return {
    ok: true,
    totals: {
      items: outItems,
      subtotal: round2(runningTotal - runningGst),
      cgst: round2(runningGst / 2),
      sgst: round2(runningGst / 2),
      gst_paid_by_operator: false,
      takeaway_charges: packing,
      discount_amount: discount,
      rounding_amount: rounding,
      total_amount: round2(netBeforeRound + rounding),
    },
  };
}
