import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiCorsHeaders } from "@/lib/api-cors";
import {
  authenticateApiKey,
  keyCoversOutlet,
  presentedApiKey,
  type ApiKeyContext,
} from "@/lib/api-keys";
import { CHANNEL_LABEL, FIRST_PARTY_SOURCES } from "@/lib/channels";
import { computeStorefrontCouponDiscount } from "@/lib/payments";
import { isUuid } from "@/lib/utils";
import type { OrderSource } from "@/lib/types";
import type { Json } from "@/lib/database.types";

// Order creation runs with the service-role admin client (bypasses RLS).
// This is intentional: the storefront accepts orders from anonymous customers
// (no sign-in required), and the POS posts from authenticated cashiers — but
// both go through this endpoint.
//
// Because anyone can call it, nothing a caller sends decides what an order
// costs:
//   - POS / web / kiosk orders are always re-priced from the catalog, and
//     their add-ons checked against what the product actually offers.
//   - Only a caller holding CHANNEL_ORDER_TOKEN may post a delivery-platform
//     order, whose totals are the platform's and are stored as sent.
// `source` picks between the two, so a caller can't reach the second path by
// naming a platform or attaching an external order id.

type OrderItemInput = {
  product_config: Json;
  quantity: number;
  unit_price: number;
  total_price: number;
  // Optional — what the customer asked for on this item ("no onion").
  instructions?: string;
};

type OrderBody = {
  customer_name: string;
  customer_email: string;
  order_type: string;
  subtotal: number;
  takeaway_charges: number;
  discount_amount?: number;
  coupon_code?: string | null;
  rounding_amount?: number;
  total_amount: number;
  items: OrderItemInput[];
  // Optional — cooking / packing instructions for the whole order.
  instructions?: string;
  // Optional — present for kiosk/pos clients and delivery-platform adapters.
  source?: OrderSource;
  outlet_id?: string;
  // Platform adapters only; ignored on first-party orders.
  external_order_id?: string;
  external_payload?: Json;
};

const FALLBACK_OUTLET_ID = process.env.NEXT_PUBLIC_DEFAULT_OUTLET_ID ?? "";

const KNOWN_SOURCES = new Set<string>([
  ...FIRST_PARTY_SOURCES,
  ...Object.keys(CHANNEL_LABEL),
]);

// Shared secret for external storefront clients (the standalone per-tenant
// storefronts that forward orders here). Authenticates that channel without
// breaking same-origin browser callers (POS / first-party checkout), which
// send no token: we only enforce a match when an `x-storefront-token` header
// is actually present. To later require it for ALL public web orders, gate the
// anon order path on this too.
const STOREFRONT_ORDER_TOKEN = process.env.STOREFRONT_ORDER_TOKEN;

// Shared secret for delivery-platform adapters, sent as `x-channel-token`.
// It is the only way to store an order at prices this server didn't compute,
// so it is required for every non-first-party source. While it is unset that
// path is closed.
const CHANNEL_ORDER_TOKEN = process.env.CHANNEL_ORDER_TOKEN;

// Compares secrets without leaking, through timing, how much of one matched.
function secretMatches(presented: string, expected: string | undefined) {
  if (!expected) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// CORS. Standalone per-tenant storefronts post here from a DIFFERENT origin,
// so the browser sends a preflight OPTIONS and expects Access-Control-* headers.
// Same-origin callers (POS / first-party checkout) are unaffected. Allowed
// origins come from STOREFRONT_ALLOWED_ORIGINS; see lib/api-cors.ts.
// ---------------------------------------------------------------------------
function corsHeaders(origin: string | null): Record<string, string> {
  return apiCorsHeaders(origin, "POST, OPTIONS");
}

// Restaurant API keys may place the orders a customer-facing frontend takes,
// and nothing that carries staff powers: "pos" orders accept a cashier's
// discount and rounding, and platform sources store prices as sent.
const API_KEY_SOURCES = new Set<string>(["web", "kiosk"]);

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

// ---------------------------------------------------------------------------
// Server-side pricing. NEVER trust client-supplied prices/totals for first-party
// orders (POS / web / kiosk): a tampered client could post total_amount = 1.
// We recompute every line from the products catalog (scoped to the outlet) and
// validate modifier options against customization_options, then derive
// GST-inclusive tax. Aggregator/external orders keep their platform's totals.
// ---------------------------------------------------------------------------
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// Free text from customers ends up on kitchen tickets: trim it, cap it, and
// treat blank as absent.
const ORDER_NOTE_MAX = 500;
const ITEM_NOTE_MAX = 200;
function cleanNote(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, max);
  return text || null;
}

// Millisecond timestamps alone repeat when two orders land together; the
// suffix keeps the number unique without making it much longer to read out.
function newOrderNumber() {
  const suffix = randomInt(36 ** 3).toString(36).toUpperCase().padStart(3, "0");
  return `BJ-${Date.now()}-${suffix}`;
}

type SelectedOptionInput = {
  group_id?: string;
  group_name?: string;
  option_id?: string;
  option_name?: string;
  price?: number;
};

type ConfigShape = {
  product_id?: string;
  name?: string;
  selected_options?: SelectedOptionInput[];
};

type Totals = {
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

// Food aggregators are e-commerce operators that pay the 5% GST on restaurant
// orders placed through them (Section 9(5), CGST Act). Those orders carry no
// CGST/SGST of ours, so GST reports don't count tax we never collected.
const OPERATOR_GST_CHANNELS = new Set<OrderSource>(["zomato", "swiggy"]);

// GST-inclusive helper: the rate is baked into the price (typical Indian QSR).
function splitGst(lineTotal: number, ratePct: number) {
  const rate = (Number(ratePct) || 0) / 100;
  return lineTotal - lineTotal / (1 + rate);
}

function configOf(item: OrderItemInput | null | undefined): ConfigShape {
  const cfg = item?.product_config;
  return cfg && typeof cfg === "object" && !Array.isArray(cfg)
    ? (cfg as ConfigShape)
    : {};
}

type Recomputed =
  | { ok: true; totals: Totals }
  | { ok: false; error: string; status: 400 | 500 };

async function recomputeFirstParty(
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
      : computeStorefrontCouponDiscount(couponCode, runningTotal);
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

// Aggregator/external path: trust the platform's prices/totals (their menu may
// be marked up). Derive GST from the line totals so invoices aren't ₹0 — unless
// the operator pays it, in which case the order carries none.
function trustExternal(body: OrderBody, source: OrderSource): Totals {
  const operatorPaysGst = OPERATOR_GST_CHANNELS.has(source);
  let gst = 0;
  const items = body.items.map((it) => {
    const cfg = configOf(it) as ConfigShape & { gst_rate?: number };
    if (!operatorPaysGst) {
      gst += splitGst(Number(it?.total_price) || 0, Number(cfg.gst_rate ?? 5));
    }
    return {
      product_config: it?.product_config ?? null,
      quantity: it?.quantity,
      unit_price: it?.unit_price,
      total_price: it?.total_price,
      instructions: cleanNote(it?.instructions, ITEM_NOTE_MAX),
    };
  });
  return {
    items,
    subtotal: round2(Number(body.subtotal) || 0),
    cgst: round2(gst / 2),
    sgst: round2(gst / 2),
    gst_paid_by_operator: operatorPaysGst,
    takeaway_charges: Math.max(0, Number(body.takeaway_charges) || 0),
    discount_amount: Math.max(0, round2(Number(body.discount_amount) || 0)),
    rounding_amount: round2(Number(body.rounding_amount) || 0),
    total_amount: round2(Number(body.total_amount) || 0),
  };
}

export async function POST(request: Request) {
  const cors = corsHeaders(request.headers.get("origin"));
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: cors });

  const presentedToken = request.headers.get("x-storefront-token");
  if (
    presentedToken !== null &&
    !secretMatches(presentedToken, STOREFRONT_ORDER_TOKEN)
  ) {
    return fail(401, "Invalid storefront token");
  }

  // A restaurant API key (Administration → API keys) ties the order to that
  // restaurant: it may only order from that restaurant's outlets, or from the
  // one outlet the key is limited to.
  let apiKey: ApiKeyContext | null = null;
  if (presentedApiKey(request)) {
    const check = await authenticateApiKey(request, "orders:write");
    if (!check.ok) return fail(check.status, check.error);
    apiKey = check.key;
  }

  let body: OrderBody;
  try {
    body = (await request.json()) as OrderBody;
  } catch {
    return fail(400, "Request body must be JSON");
  }

  if (
    !body ||
    !body.customer_name ||
    !body.customer_email ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    return fail(400, "Missing customer or items");
  }

  const source: OrderSource = body.source ?? "web";
  if (!KNOWN_SOURCES.has(source)) {
    return fail(400, "Unknown order source");
  }

  // The one decision that sets whose prices are stored. It rests on the
  // source alone, and a platform source needs the adapter secret.
  const firstParty = FIRST_PARTY_SOURCES.includes(source);
  if (apiKey && !API_KEY_SOURCES.has(source)) {
    return fail(403, "API keys can place web or kiosk orders only");
  }
  if (!firstParty) {
    const channelToken = request.headers.get("x-channel-token");
    if (!channelToken || !secretMatches(channelToken, CHANNEL_ORDER_TOKEN)) {
      return fail(401, "Platform orders need a valid channel token");
    }
  }

  // External ids and payloads belong to platform orders. Dropped on our own
  // orders so they can't be used to look up, or collide with, someone else's.
  const externalOrderId =
    !firstParty &&
    typeof body.external_order_id === "string" &&
    body.external_order_id.trim()
      ? body.external_order_id.trim()
      : null;
  const externalPayload = firstParty ? null : (body.external_payload ?? null);

  const supabase = createAdminClient();
  const outletId = body.outlet_id ?? apiKey?.outletId ?? FALLBACK_OUTLET_ID;
  if (!isUuid(outletId)) {
    return fail(400, "Unknown or inactive outlet");
  }

  // Validate the outlet exists and is active. Required now that the public
  // storefront posts a user-resolved outlet_id: never insert an order against
  // an unknown/inactive outlet.
  const { data: outletRow } = await supabase
    .from("outlets")
    .select("id, status, restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!outletRow || outletRow.status !== "active") {
    return fail(400, "Unknown or inactive outlet");
  }
  if (apiKey && !keyCoversOutlet(apiKey, outletRow)) {
    return fail(403, "This API key can't place orders for that outlet");
  }

  // Idempotency for platform webhooks: if this (outlet, source, external_order_id)
  // already landed, return the existing order rather than inserting a duplicate.
  const findExisting = async () => {
    if (!externalOrderId) return null;
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("outlet_id", outletId)
      .eq("source", source)
      .eq("external_order_id", externalOrderId)
      .maybeSingle();
    return data;
  };
  const existing = await findExisting();
  if (existing) {
    return NextResponse.json({ order: existing, deduped: true }, { headers: cors });
  }

  // Recompute first-party orders from the catalog; keep a platform's totals.
  let totals: Totals;
  if (firstParty) {
    const result = await recomputeFirstParty(
      supabase,
      outletId,
      body.items,
      body.takeaway_charges,
      source === "pos" ? body.discount_amount : 0,
      source === "pos" ? body.rounding_amount : 0,
      source !== "pos" ? body.coupon_code : null,
    );
    if (!result.ok) return fail(result.status, result.error);
    totals = result.totals;
  } else {
    totals = trustExternal(body, source);
  }

  // The instructions columns arrive with migration 20261111090000. They are
  // only named when there is something to store, so orders without
  // instructions keep working on a database that hasn't had it applied yet.
  const orderNote = cleanNote(body.instructions, ORDER_NOTE_MAX);
  const anyItemNote = totals.items.some((it) => it.instructions);
  const tokenNumber = randomInt(101, 999);

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      outlet_id: outletId,
      source,
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      order_type: body.order_type,
      subtotal: totals.subtotal,
      cgst_amount: totals.cgst,
      sgst_amount: totals.sgst,
      gst_paid_by_operator: totals.gst_paid_by_operator,
      takeaway_charges: totals.takeaway_charges,
      discount_amount: totals.discount_amount,
      rounding_amount: totals.rounding_amount,
      total_amount: totals.total_amount,
      token_number: tokenNumber,
      status: "pending",
      unique_order_id: newOrderNumber(),
      external_order_id: externalOrderId,
      external_payload: externalPayload,
      ...(orderNote ? { instructions: orderNote } : {}),
    })
    .select()
    .single();

  if (orderErr || !order) {
    // A retried webhook can pass the lookup above while its first attempt is
    // still being written; the unique index on the external id stops the
    // second insert, and that attempt's order is the answer.
    if (orderErr?.code === "23505") {
      const raced = await findExisting();
      if (raced) {
        return NextResponse.json({ order: raced, deduped: true }, { headers: cors });
      }
    }
    return fail(500, orderErr?.message ?? "Failed to create order");
  }

  const { data: insertedItems, error: itemsErr } = await supabase
    .from("order_items")
    .insert(
      totals.items.map((it) => ({
        order_id: order.id,
        product_config: it.product_config,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
        ...(anyItemNote ? { instructions: it.instructions } : {}),
      })),
    )
    .select("id, quantity, instructions");

  if (itemsErr) {
    // The order and its lines are two writes, not one transaction. Take the
    // order back out so the kitchen never gets a ticket with nothing on it.
    const { error: undoErr } = await supabase
      .from("orders")
      .delete()
      .eq("id", order.id);
    if (undoErr) {
      console.error(
        `Order ${order.id} has no items and could not be removed: ${undoErr.message}`,
      );
    }
    return fail(500, itemsErr.message);
  }

  // Create a live KOT ticket for the Kitchen Display System (KDS)
  if (insertedItems && insertedItems.length > 0) {
    const { data: ticket } = await supabase
      .from("kot_tickets")
      .insert({
        outlet_id: outletId,
        order_id: order.id,
        ticket_number: tokenNumber,
        status: "printed",
        notes: orderNote,
        printed_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (ticket) {
      await supabase.from("kot_ticket_items").insert(
        insertedItems.map((oi) => ({
          kot_ticket_id: ticket.id,
          order_item_id: oi.id,
          quantity: oi.quantity,
          notes: oi.instructions,
        })),
      );
    }
  }

  return NextResponse.json({ order }, { headers: cors });
}
