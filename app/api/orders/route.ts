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
import {
  CHANNEL_LABEL,
  FIRST_PARTY_SOURCES,
} from "@/lib/channels";
import { recordCouponRedemption } from "@/lib/coupons";
import {
  resolveChannelStoreOutlet,
  type ChannelStoreLookupClient,
} from "@/lib/channel-bridge";
import { isOutletOpen } from "@/lib/opening-hours";
import { dispatchOrderStatusWebhooks } from "@/lib/order-webhooks";
import { deductOrderRecipeStock } from "@/lib/inventory";
import { insertRoutedKotTickets } from "@/lib/kot-routing";
import {
  applyOrderLoyaltyOnSettlement,
  computeMaxRedeemablePoints,
  getLoyaltySettings,
  lookupLoyaltyWalletByPhone,
  normalizeLoyaltyPhone,
} from "@/lib/loyalty";
import { resolveOrderPaymentMode, validateSplitAllocations } from "@/lib/register";
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
  customer_phone?: string | null;
  payment_mode?: string | null;
  offline_id?: string | null;
  placed_at?: string | null;
  loyalty_points_redeemed?: number;
  split_allocations?: Array<{
    mode: "cash" | "upi" | "card";
    amount: number;
    referenceNo?: string;
  }>;
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
  external_store_id?: string;
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
  let outletId = body.outlet_id ?? apiKey?.outletId ?? "";
  if (!firstParty && !outletId && body.external_store_id?.trim()) {
    const resolvedStore = await resolveChannelStoreOutlet(
      supabase as unknown as ChannelStoreLookupClient,
      source,
      body.external_store_id,
    );
    if (!resolvedStore) {
      return fail(
        404,
        `No outlet linked for ${CHANNEL_LABEL[source as keyof typeof CHANNEL_LABEL] ?? source} store "${body.external_store_id.trim()}"`,
      );
    }
    if (!resolvedStore.isOnline) {
      return fail(
        409,
        `Outlet is marked offline on ${CHANNEL_LABEL[source as keyof typeof CHANNEL_LABEL] ?? source}`,
      );
    }
    outletId = resolvedStore.outletId;
  }
  if (!outletId) {
    outletId = FALLBACK_OUTLET_ID;
  }
  if (!isUuid(outletId)) {
    return fail(400, "Unknown or inactive outlet");
  }

  // Enforce channel online toggle even when adapter sends outlet_id directly
  if (!firstParty) {
    const { data: channelLink } = await supabase
      .from("channel_outlets")
      .select("is_online")
      .eq("outlet_id", outletId)
      .eq("channel", source)
      .maybeSingle();
    if (channelLink && !channelLink.is_online) {
      return fail(
        409,
        `Outlet is marked offline on ${CHANNEL_LABEL[source as keyof typeof CHANNEL_LABEL] ?? source}`,
      );
    }
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

  const offlineId =
    source === "pos" &&
    typeof body.offline_id === "string" &&
    body.offline_id.trim()
      ? body.offline_id.trim().slice(0, 120)
      : null;

  const findExisting = async () => {
    if (externalOrderId) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("outlet_id", outletId)
        .eq("source", source)
        .eq("external_order_id", externalOrderId)
        .maybeSingle();
      if (data) return data;
    }
    if (offlineId) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("outlet_id", outletId)
        .eq("offline_id", offlineId)
        .maybeSingle();
      if (data) return data;
    }
    return null;
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
  const resolvedPaymentMode = resolveOrderPaymentMode({
    source,
    payment_mode: body.payment_mode ?? null,
    customer_email: body.customer_email,
  });

  // Loyalty redemption (for POS settlements with valid phone)
  const cleanPhone = normalizeLoyaltyPhone(body.customer_phone);
  let loyaltyPointsRedeemed = 0;
  let loyaltyDiscountAmount = 0;
  let finalTotalAmount = totals.total_amount;
  let finalRoundingAmount = totals.rounding_amount;

  if (
    source === "pos" &&
    cleanPhone &&
    Number(body.loyalty_points_redeemed ?? 0) > 0
  ) {
    const [lSettings, { wallet }] = await Promise.all([
      getLoyaltySettings(supabase, outletRow.restaurant_id),
      lookupLoyaltyWalletByPhone(supabase, outletRow.restaurant_id, cleanPhone),
    ]);
    const cap = computeMaxRedeemablePoints({
      balance: wallet?.points_balance ?? 0,
      orderSubtotal: Math.max(
        0,
        totals.total_amount + totals.rounding_amount,
      ),
      settings: lSettings,
    });
    const reqPts = Math.min(
      Math.floor(Number(body.loyalty_points_redeemed) || 0),
      cap.maxPoints,
    );
    if (reqPts >= lSettings.min_points_to_redeem && reqPts > 0) {
      loyaltyPointsRedeemed = reqPts;
      loyaltyDiscountAmount = Math.min(
        Math.max(0, totals.total_amount - totals.rounding_amount),
        round2(reqPts * Number(lSettings.point_value)),
      );
      const netAfterLoyalty = Math.max(
        0,
        totals.total_amount - totals.rounding_amount - loyaltyDiscountAmount,
      );
      finalTotalAmount = Math.round(netAfterLoyalty);
      finalRoundingAmount = round2(finalTotalAmount - netAfterLoyalty);
    }
  }

  let validatedSplits: Array<{
    mode: "cash" | "upi" | "card";
    amount: number;
    referenceNo?: string | null;
  }> = [];
  if (
    source === "pos" &&
    resolvedPaymentMode === "split" &&
    Array.isArray(body.split_allocations)
  ) {
    const splitCheck = validateSplitAllocations(
      finalTotalAmount,
      body.split_allocations,
    );
    if (!splitCheck.ok) return fail(400, splitCheck.error);
    validatedSplits = splitCheck.normalized;
  }

  // Offline queued bill timestamps (within last 7 days and <= 5m in the future)
  const nowMs = Date.now();
  let customPlacedAt: string | null = null;
  let initialStatus: "pending" | "completed" = "pending";
  if (source === "pos" && typeof body.placed_at === "string" && body.placed_at.trim()) {
    const parsedMs = Date.parse(body.placed_at);
    if (
      Number.isFinite(parsedMs) &&
      parsedMs >= nowMs - 7 * 24 * 60 * 60_000 &&
      parsedMs <= nowMs + 5 * 60_000
    ) {
      customPlacedAt = new Date(parsedMs).toISOString();
      if (offlineId && nowMs - parsedMs > 30 * 60_000) {
        initialStatus = "completed";
      }
    }
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      outlet_id: outletId,
      table_id: resolvedTableId,
      customer_account_id: customerAccountId,
      source,
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      ...(cleanPhone
        ? { customer_phone: cleanPhone }
        : body.customer_phone?.trim()
          ? { customer_phone: body.customer_phone.trim().slice(0, 30) }
          : {}),
      payment_mode: resolvedPaymentMode,
      ...(resolvedPaymentMode !== "open" ? { payment_status: "paid" } : {}),
      order_type: resolvedOrderType,
      subtotal: totals.subtotal,
      cgst_amount: totals.cgst,
      sgst_amount: totals.sgst,
      gst_paid_by_operator: totals.gst_paid_by_operator,
      takeaway_charges: totals.takeaway_charges,
      discount_amount: totals.discount_amount,
      loyalty_points_redeemed: loyaltyPointsRedeemed,
      loyalty_discount_amount: loyaltyDiscountAmount,
      rounding_amount: finalRoundingAmount,
      total_amount: finalTotalAmount,
      token_number: tokenNumber,
      status: initialStatus,
      unique_order_id: newOrderNumber(),
      external_order_id: externalOrderId,
      external_payload: externalPayload,
      ...(offlineId
        ? {
            offline_id: offlineId,
            offline_synced_at: new Date().toISOString(),
          }
        : {}),
      ...(customPlacedAt ? { placed_at: customPlacedAt } : {}),
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
    .select("id, quantity, instructions, product_config");

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
    await insertRoutedKotTickets(supabase, {
      outletId,
      orderId: order.id,
      tokenNumber,
      notes: orderNote,
      insertedItems,
    });
  }

  if (source === "pos" && finalTotalAmount > 0) {
    if (resolvedPaymentMode === "split" && validatedSplits.length > 0) {
      await supabase.from("order_payments").insert(
        validatedSplits.map((leg) => ({
          restaurant_id: outletRow.restaurant_id,
          outlet_id: outletId,
          order_id: order.id,
          payment_mode: leg.mode,
          amount: leg.amount,
          reference_no: leg.referenceNo ?? null,
        })),
      );
    } else if (
      resolvedPaymentMode === "cash" ||
      resolvedPaymentMode === "upi" ||
      resolvedPaymentMode === "card"
    ) {
      await supabase.from("order_payments").insert({
        restaurant_id: outletRow.restaurant_id,
        outlet_id: outletId,
        order_id: order.id,
        payment_mode: resolvedPaymentMode,
        amount: finalTotalAmount,
      });
    }
  }

  if (resolvedPaymentMode !== "open") {
    void deductOrderRecipeStock({ orderId: order.id, outletId });
    if (firstParty && (cleanPhone || body.customer_phone)) {
      await applyOrderLoyaltyOnSettlement(supabase, {
        restaurantId: outletRow.restaurant_id,
        outletId,
        orderId: order.id,
        customerPhone: cleanPhone ?? body.customer_phone,
        customerName: body.customer_name,
        customerEmail: body.customer_email,
        orderSubtotal: Math.max(0, totals.total_amount),
        netPaidAmount: finalTotalAmount,
        requestedRedeemPoints: loyaltyPointsRedeemed,
      });
    }
  }

  if (firstParty && source !== "pos" && body.coupon_code && totals.discount_amount > 0) {
    void recordCouponRedemption(supabase, outletId, body.coupon_code);
  }

  void dispatchOrderStatusWebhooks(order.id, "order.created");
  const { data: freshOrder } = await supabase
    .from("orders")
    .select("*")
    .eq("id", order.id)
    .maybeSingle();
  return NextResponse.json({ order: freshOrder ?? order, deduped: false }, { headers: cors });
}
