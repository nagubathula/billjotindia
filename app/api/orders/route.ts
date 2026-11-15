import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPosBillingAccess } from "@/lib/pos-auth";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import {
  authenticateApiKey,
  keyCoversOutlet,
  presentedApiKey,
  type ApiKeyContext,
} from "@/lib/api-keys";
import { CHANNEL_LABEL, FIRST_PARTY_SOURCES } from "@/lib/channels";
import { isOutletOpen } from "@/lib/opening-hours";
import { dispatchOrderStatusWebhooks } from "@/lib/order-webhooks";
import { resolveOptionalCustomerIdForOrder } from "@/lib/storefront-customers";
import {
  ITEM_NOTE_MAX,
  ORDER_NOTE_MAX,
  cleanNote,
  configOf,
  isOrderType,
  newOrderNumber,
  recomputeFirstParty,
  resolveTableForOrder,
  round2,
  splitGst,
  type ConfigShape,
  type OrderItemInput,
  type Totals,
} from "@/lib/order-pricing";
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { isUuid } from "@/lib/utils";
import type { OrderSource, OrderType } from "@/lib/types";
import type { Json } from "@/lib/database.types";

type OrderBody = {
  customer_name: string;
  customer_email: string;
  order_type?: string;
  table_id?: string | null;
  table_code?: string | null;
  subtotal?: number;
  takeaway_charges?: number;
  discount_amount?: number;
  coupon_code?: string | null;
  rounding_amount?: number;
  total_amount?: number;
  items: OrderItemInput[];
  instructions?: string;
  source?: OrderSource;
  outlet_id?: string;
  external_order_id?: string;
  external_payload?: Json;
};

const FALLBACK_OUTLET_ID = process.env.NEXT_PUBLIC_DEFAULT_OUTLET_ID ?? "";

const KNOWN_SOURCES = new Set<string>([
  ...FIRST_PARTY_SOURCES,
  ...Object.keys(CHANNEL_LABEL),
]);

const CHANNEL_ORDER_TOKEN = process.env.CHANNEL_ORDER_TOKEN;

function secretMatches(presented: string, expected: string | undefined) {
  if (!expected) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const API_KEY_SOURCES = new Set<string>(["web", "kiosk"]);

export async function OPTIONS(request: Request) {
  const headers = await preflightCorsHeaders(request, "POST, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

const OPERATOR_GST_CHANNELS = new Set<OrderSource>(["zomato", "swiggy"]);

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
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(origin, "POST, OPTIONS", null, request.url);
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: cors });

  // Broad IP flood guard before touching auth or body parsing
  const ipGuard = await checkRateLimit({
    bucket: `orders:ip-guard:${ip}`,
    limit: 120,
    windowSeconds: 60,
  });
  if (!ipGuard.allowed) {
    cors = { ...cors, ...rateLimitHeaders(ipGuard) };
    return fail(429, "Too many requests. Please slow down and try again shortly.");
  }

  let apiKey: ApiKeyContext | null = null;
  if (presentedApiKey(request)) {
    const check = await authenticateApiKey(request, "orders:write");
    if (!check.ok) return fail(check.status, check.error);
    apiKey = check.key;
    cors = apiCorsHeaders(
      origin,
      "POST, OPTIONS",
      apiKey.allowedOrigins,
      request.url,
    );

    const keyLimit = await checkRateLimit({
      bucket: `orders:key:${apiKey.id}`,
      limit: 30,
      windowSeconds: 60,
    });
    cors = { ...cors, ...rateLimitHeaders(keyLimit) };
    if (!keyLimit.allowed) {
      return fail(429, "Too many orders placed with this API key. Please try again shortly.");
    }
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

  // Rate-limit anonymous public web/kiosk orders per IP
  if (!apiKey && firstParty && source !== "pos") {
    const anonLimit = await checkRateLimit({
      bucket: `orders:anon:${ip}`,
      limit: 20,
      windowSeconds: 60,
    });
    cors = { ...cors, ...rateLimitHeaders(anonLimit) };
    if (!anonLimit.allowed) {
      return fail(429, "Too many orders from this connection. Please wait a minute and retry.");
    }
  }

  // Validate order_type
  let resolvedOrderType: OrderType;
  if (firstParty) {
    const rawType =
      body.order_type === undefined || body.order_type === null || body.order_type === ""
        ? "takeaway"
        : body.order_type;
    if (!isOrderType(rawType)) {
      return fail(400, 'order_type must be "takeaway", "dine-in", or "delivery"');
    }
    resolvedOrderType = rawType;
  } else {
    resolvedOrderType = isOrderType(body.order_type)
      ? body.order_type
      : "delivery";
  }

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

  const { data: outletRow } = await supabase
    .from("outlets")
    .select("id, status, restaurant_id, timezone, opening_hours")
    .eq("id", outletId)
    .maybeSingle();
  if (!outletRow || outletRow.status !== "active") {
    return fail(400, "Unknown or inactive outlet");
  }
  if (apiKey && !keyCoversOutlet(apiKey, outletRow)) {
    return fail(403, "This API key can't place orders for that outlet");
  }

  // POS orders carry the cashier's discount and rounding, so only a signed-in
  // admin, manager or cashier of this restaurant may send one.
  if (source === "pos") {
    const access = await checkPosBillingAccess(outletId);
    if (!access.ok) return fail(access.status, access.error);
  }

  // Enforce outlet opening hours on customer-facing web & kiosk orders
  if (firstParty && source !== "pos") {
    const openCheck = isOutletOpen(
      outletRow.opening_hours,
      outletRow.timezone,
    );
    if (!openCheck.open) {
      return fail(
        400,
        openCheck.nextOpen
          ? `This outlet is currently closed (opens ${openCheck.nextOpen}).`
          : "This outlet is currently closed and not accepting orders right now.",
      );
    }
  }

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

  let totals: Totals;
  if (firstParty) {
    const result = await recomputeFirstParty(
      supabase,
      outletId,
      body.items,
      body.takeaway_charges ?? 0,
      source === "pos" ? body.discount_amount : 0,
      source === "pos" ? body.rounding_amount : 0,
      source !== "pos" ? body.coupon_code : null,
    );
    if (!result.ok) return fail(result.status, result.error);
    totals = result.totals;
  } else {
    totals = trustExternal(body, source);
  }

  const [resolvedTableId, customerAccountId] = await Promise.all([
    resolvedOrderType === "dine-in"
      ? resolveTableForOrder(supabase, outletId, {
          tableId: body.table_id,
          tableCode: body.table_code,
          customerName: body.customer_name,
        })
      : Promise.resolve(null),
    firstParty && source !== "pos"
      ? resolveOptionalCustomerIdForOrder(request, outletId)
      : Promise.resolve(null),
  ]);

  const orderNote = cleanNote(body.instructions, ORDER_NOTE_MAX);
  const anyItemNote = totals.items.some((it) => it.instructions);
  const tokenNumber = randomInt(101, 999);

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      outlet_id: outletId,
      table_id: resolvedTableId,
      customer_account_id: customerAccountId,
      source,
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      order_type: resolvedOrderType,
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

  void dispatchOrderStatusWebhooks(order.id, "order.created");
  return NextResponse.json({ order, deduped: false }, { headers: cors });
}
