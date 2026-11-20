import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import {
  STOREFRONT_COUPONS,
  computeStorefrontCouponDiscount,
  recordCouponRedemption,
  resolveOrderCouponDiscount,
} from "@/lib/coupons";
import {
  buildModifiersByProductMap,
  evaluateProductCustomizations,
  type ModifierGroupData,
  type ModifierOptionData,
} from "@/lib/customizations";
import { isOutletOpen } from "@/lib/opening-hours";
import { deductOrderRecipeStock } from "@/lib/inventory";
import { insertRoutedKotTickets } from "@/lib/kot-routing";
import { applyOrderLoyaltyOnSettlement } from "@/lib/loyalty";
import { dispatchOrderStatusWebhooks } from "@/lib/order-webhooks";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";
import type { Json } from "@/lib/database.types";

const VALID_ORDER_TYPES = ["dine-in", "takeaway", "delivery"] as const;
const RUNNING_POS_ORDER_EMAIL = "pos+open@billjot.local";

export { STOREFRONT_COUPONS, computeStorefrontCouponDiscount };

// ---------------------------------------------------------------------------
// Per-Outlet + Env Fallback Payment Gateway Configuration
// Stored in `payment_sessions` under `order_reference = gateway_config:<outletId>`
// (which is service-role-only under RLS, keeping secret keys completely private)
// alongside boolean flags in `payment_settings`.
// ---------------------------------------------------------------------------
export type OutletGatewaySecrets = {
  razorpayEnabled: boolean;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpayWebhookSecret: string;
  stripeEnabled: boolean;
  stripePublishableKey: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  upiVpa: string;
};

export type PublicPaymentConfig = {
  codEnabled: boolean;
  onlineEnabled: boolean;
  razorpayEnabled: boolean;
  razorpayKeyId: string | null;
  stripeEnabled: boolean;
  stripePublishableKey: string | null;
  upiVpa: string | null;
};

export type AdminGatewaySettingsView = {
  codEnabled: boolean;
  onlineEnabled: boolean;
  razorpayEnabled: boolean;
  razorpayKeyId: string;
  hasRazorpaySecret: boolean;
  hasRazorpayWebhookSecret: boolean;
  stripeEnabled: boolean;
  stripePublishableKey: string;
  hasStripeSecret: boolean;
  hasStripeWebhookSecret: boolean;
  upiVpa: string;
  usingEnvRazorpay: boolean;
  usingEnvStripe: boolean;
};

const GATEWAY_REF_PREFIX = "gateway_config:";

export async function getOutletGatewayConfig(outletId: string): Promise<{
  codEnabled: boolean;
  onlineEnabled: boolean;
  secrets: OutletGatewaySecrets;
  usingEnvRazorpay: boolean;
  usingEnvStripe: boolean;
}> {
  const admin = createAdminClient();
  const ref = `${GATEWAY_REF_PREFIX}${outletId}`;

  const [{ data: settingsRow }, { data: sessionRow }] = await Promise.all([
    admin
      .from("payment_settings")
      .select("cod_enabled, online_enabled")
      .eq("outlet_id", outletId)
      .maybeSingle(),
    admin
      .from("payment_sessions")
      .select("order_data")
      .eq("order_reference", ref)
      .maybeSingle(),
  ]);

  const raw =
    sessionRow?.order_data &&
    typeof sessionRow.order_data === "object" &&
    !Array.isArray(sessionRow.order_data)
      ? (sessionRow.order_data as Partial<OutletGatewaySecrets>)
      : {};

  const envRzpId = (
    process.env.RAZORPAY_KEY_ID ??
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ??
    ""
  ).trim();
  const envRzpSecret = (process.env.RAZORPAY_KEY_SECRET ?? "").trim();
  const envRzpWebhook = (process.env.RAZORPAY_WEBHOOK_SECRET ?? "").trim();

  const envStripePub = (
    process.env.STRIPE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
    ""
  ).trim();
  const envStripeSecret = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  const envStripeWebhook = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  const envUpi = (process.env.MERCHANT_UPI_VPA ?? "").trim();

  const razorpayKeyId = (raw.razorpayKeyId || envRzpId).trim();
  const razorpayKeySecret = (raw.razorpayKeySecret || envRzpSecret).trim();
  const razorpayWebhookSecret = (
    raw.razorpayWebhookSecret || envRzpWebhook
  ).trim();

  const stripePublishableKey = (
    raw.stripePublishableKey || envStripePub
  ).trim();
  const stripeSecretKey = (raw.stripeSecretKey || envStripeSecret).trim();
  const stripeWebhookSecret = (
    raw.stripeWebhookSecret || envStripeWebhook
  ).trim();

  const hasRzpCreds = Boolean(razorpayKeyId && razorpayKeySecret);
  const hasStripeCreds = Boolean(stripeSecretKey);

  const razorpayEnabled =
    raw.razorpayEnabled !== undefined
      ? Boolean(raw.razorpayEnabled && hasRzpCreds)
      : hasRzpCreds;

  const stripeEnabled =
    raw.stripeEnabled !== undefined
      ? Boolean(raw.stripeEnabled && hasStripeCreds)
      : hasStripeCreds;

  return {
    codEnabled: settingsRow?.cod_enabled ?? true,
    onlineEnabled: settingsRow?.online_enabled ?? true,
    secrets: {
      razorpayEnabled,
      razorpayKeyId,
      razorpayKeySecret,
      razorpayWebhookSecret,
      stripeEnabled,
      stripePublishableKey,
      stripeSecretKey,
      stripeWebhookSecret,
      upiVpa: (raw.upiVpa || envUpi).trim(),
    },
    usingEnvRazorpay: Boolean(!raw.razorpayKeySecret && envRzpSecret),
    usingEnvStripe: Boolean(!raw.stripeSecretKey && envStripeSecret),
  };
}

export async function getPublicPaymentConfig(
  outletId: string,
): Promise<PublicPaymentConfig> {
  const cfg = await getOutletGatewayConfig(outletId);
  const onlineActive = cfg.onlineEnabled;
  return {
    codEnabled: cfg.codEnabled,
    onlineEnabled: onlineActive,
    razorpayEnabled: onlineActive && cfg.secrets.razorpayEnabled,
    razorpayKeyId:
      onlineActive && cfg.secrets.razorpayEnabled
        ? cfg.secrets.razorpayKeyId
        : null,
    stripeEnabled: onlineActive && cfg.secrets.stripeEnabled,
    stripePublishableKey:
      onlineActive && cfg.secrets.stripeEnabled
        ? cfg.secrets.stripePublishableKey || null
        : null,
    upiVpa: cfg.secrets.upiVpa || null,
  };
}

export async function getAdminGatewaySettingsView(
  outletId: string,
): Promise<AdminGatewaySettingsView> {
  const cfg = await getOutletGatewayConfig(outletId);
  return {
    codEnabled: cfg.codEnabled,
    onlineEnabled: cfg.onlineEnabled,
    razorpayEnabled: cfg.secrets.razorpayEnabled,
    razorpayKeyId: cfg.secrets.razorpayKeyId,
    hasRazorpaySecret: Boolean(cfg.secrets.razorpayKeySecret),
    hasRazorpayWebhookSecret: Boolean(cfg.secrets.razorpayWebhookSecret),
    stripeEnabled: cfg.secrets.stripeEnabled,
    stripePublishableKey: cfg.secrets.stripePublishableKey,
    hasStripeSecret: Boolean(cfg.secrets.stripeSecretKey),
    hasStripeWebhookSecret: Boolean(cfg.secrets.stripeWebhookSecret),
    upiVpa: cfg.secrets.upiVpa,
    usingEnvRazorpay: cfg.usingEnvRazorpay,
    usingEnvStripe: cfg.usingEnvStripe,
  };
}

export async function saveOutletGatewayConfig(
  outletId: string,
  update: {
    codEnabled: boolean;
    onlineEnabled: boolean;
    razorpayEnabled: boolean;
    razorpayKeyId: string;
    razorpayKeySecret?: string; // omit or blank to keep existing
    razorpayWebhookSecret?: string;
    stripeEnabled: boolean;
    stripePublishableKey: string;
    stripeSecretKey?: string; // omit or blank to keep existing
    stripeWebhookSecret?: string;
    upiVpa: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const ref = `${GATEWAY_REF_PREFIX}${outletId}`;

  // Load existing secrets so blank secret fields preserve previously saved secrets
  const { data: existingSession } = await admin
    .from("payment_sessions")
    .select("id, order_data")
    .eq("order_reference", ref)
    .maybeSingle();

  const prev =
    existingSession?.order_data &&
    typeof existingSession.order_data === "object" &&
    !Array.isArray(existingSession.order_data)
      ? (existingSession.order_data as Partial<OutletGatewaySecrets>)
      : {};

  const nextSecrets: OutletGatewaySecrets = {
    razorpayEnabled: update.razorpayEnabled,
    razorpayKeyId: update.razorpayKeyId.trim(),
    razorpayKeySecret:
      update.razorpayKeySecret && update.razorpayKeySecret.trim()
        ? update.razorpayKeySecret.trim()
        : (prev.razorpayKeySecret ?? ""),
    razorpayWebhookSecret:
      update.razorpayWebhookSecret && update.razorpayWebhookSecret.trim()
        ? update.razorpayWebhookSecret.trim()
        : (prev.razorpayWebhookSecret ?? ""),
    stripeEnabled: update.stripeEnabled,
    stripePublishableKey: update.stripePublishableKey.trim(),
    stripeSecretKey:
      update.stripeSecretKey && update.stripeSecretKey.trim()
        ? update.stripeSecretKey.trim()
        : (prev.stripeSecretKey ?? ""),
    stripeWebhookSecret:
      update.stripeWebhookSecret && update.stripeWebhookSecret.trim()
        ? update.stripeWebhookSecret.trim()
        : (prev.stripeWebhookSecret ?? ""),
    upiVpa: update.upiVpa.trim(),
  };

  // Upsert payment_settings flags
  const { data: existingSettings } = await admin
    .from("payment_settings")
    .select("id")
    .eq("outlet_id", outletId)
    .maybeSingle();

  if (existingSettings?.id) {
    const { error: setErr } = await admin
      .from("payment_settings")
      .update({
        cod_enabled: update.codEnabled,
        online_enabled: update.onlineEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingSettings.id);
    if (setErr) return { ok: false, error: setErr.message };
  } else {
    const { error: insErr } = await admin.from("payment_settings").insert({
      outlet_id: outletId,
      cod_enabled: update.codEnabled,
      online_enabled: update.onlineEnabled,
      shop_open: true,
      show_banners: true,
      sms_enabled: true,
    });
    if (insErr) return { ok: false, error: insErr.message };
  }

  // Upsert gateway secrets row
  if (existingSession?.id) {
    const { error } = await admin
      .from("payment_sessions")
      .update({ order_data: nextSecrets as unknown as Json })
      .eq("id", existingSession.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("payment_sessions").insert({
      order_reference: ref,
      order_data: nextSecrets as unknown as Json,
    });
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Server-Side Catalog Price Verification & Paid Order Finalization
// ---------------------------------------------------------------------------
export type CheckoutItemInput = {
  product_config: Json;
  quantity: number;
  instructions?: string;
};

export type VerifiedOrderDraft = {
  outlet_id: string;
  restaurant_slug?: string;
  table_id?: string | null;
  customer_account_id?: string | null;
  existing_order_id?: string | null;
  pos_tab_id?: string | null;
  coupon_code?: string | null;
  source: "web" | "pos" | "kiosk";
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  order_type: string;
  instructions: string | null;
  subtotal: number;
  cgst: number;
  sgst: number;
  takeaway_charges: number;
  discount_amount: number;
  rounding_amount: number;
  total_amount: number;
  items: Array<{
    product_config: Json;
    quantity: number;
    unit_price: number;
    total_price: number;
    instructions: string | null;
  }>;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
function splitGst(lineTotal: number, ratePct: number) {
  const rate = (Number(ratePct) || 0) / 100;
  return lineTotal - lineTotal / (1 + rate);
}

function cleanText(val: unknown, max: number): string | null {
  if (typeof val !== "string") return null;
  const t = val.trim().slice(0, max);
  return t || null;
}

async function resolvePaymentTableId(
  admin: ReturnType<typeof createAdminClient>,
  outletId: string,
  tableId: unknown,
  customerName: string,
): Promise<string | null> {
  if (isUuid(tableId)) {
    const { data } = await admin
      .from("pos_tabs")
      .select("id")
      .eq("id", tableId)
      .eq("outlet_id", outletId)
      .maybeSingle();
    return data?.id ?? null;
  }
  const explicitCode =
    typeof tableId === "string" ? tableId.split("·")[0].trim() : "";
  const raw = customerName.trim();
  const candidate =
    explicitCode ||
    (raw.includes("·")
      ? raw.split("·")[0].trim()
      : /^[a-z]{1,6}[- ]?\d{1,4}$/i.test(raw)
        ? raw
        : "");
  if (!candidate) return null;
  const { data: tabs } = await admin
    .from("pos_tabs")
    .select("id, name")
    .eq("outlet_id", outletId);
  const needle = candidate.toLowerCase();
  for (const t of tabs ?? []) {
    if (t.name.split("·")[0].trim().toLowerCase() === needle) return t.id;
  }
  return null;
}

export async function buildVerifiedOrderDraft(input: {
  outletId: string;
  restaurantSlug?: string;
  tableId?: string | null;
  customerAccountId?: string | null;
  existingOrderId?: string | null;
  posTabId?: string | null;
  source: "web" | "pos" | "kiosk";
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  orderType: string;
  instructions?: string | null;
  couponCode?: string | null;
  posDiscountAmount?: number;
  posRoundingAmount?: number;
  takeawayCharges?: number;
  items: CheckoutItemInput[];
}): Promise<
  { ok: true; draft: VerifiedOrderDraft } | { ok: false; error: string }
> {
  if (!isUuid(input.outletId)) {
    return { ok: false, error: "Invalid outlet ID" };
  }
  const normalizedOrderType = input.orderType?.trim() || "dine-in";
  if (
    !(VALID_ORDER_TYPES as readonly string[]).includes(normalizedOrderType)
  ) {
    return {
      ok: false,
      error: 'order_type must be "dine-in", "takeaway", or "delivery"',
    };
  }

  const admin = createAdminClient();
  const { data: outletRow } = await admin
    .from("outlets")
    .select("id, status, timezone, opening_hours")
    .eq("id", input.outletId)
    .maybeSingle();
  if (!outletRow || outletRow.status !== "active") {
    return { ok: false, error: "Outlet is inactive or not found" };
  }

  if (input.source !== "pos") {
    const openCheck = isOutletOpen(
      outletRow.opening_hours,
      outletRow.timezone,
    );
    if (!openCheck.open) {
      return {
        ok: false,
        error: openCheck.nextOpen
          ? `This outlet is currently closed (opens ${openCheck.nextOpen}).`
          : "This outlet is currently closed and not accepting orders right now.",
      };
    }
  }

  // Settling an already-running POS table order via online gateway (Razorpay/Stripe)
  if (input.source === "pos" && isUuid(input.existingOrderId)) {
    const { data: runningOrder } = await admin
      .from("orders")
      .select("id, outlet_id, table_id, customer_name, customer_email, status, instructions")
      .eq("id", input.existingOrderId)
      .eq("outlet_id", input.outletId)
      .maybeSingle();
    if (
      !runningOrder ||
      runningOrder.customer_email !== RUNNING_POS_ORDER_EMAIL ||
      runningOrder.status === "cancelled" ||
      runningOrder.status === "completed"
    ) {
      return {
        ok: false,
        error: "This table's running order is already settled or unavailable.",
      };
    }

    const { data: runningItems, error: rItemsErr } = await admin
      .from("order_items")
      .select("product_config, quantity, unit_price, total_price, instructions")
      .eq("order_id", runningOrder.id);
    if (rItemsErr || !runningItems || runningItems.length === 0) {
      return { ok: false, error: "Running order has no items to bill." };
    }

    let runningGross = 0;
    let runningGst = 0;
    for (const ri of runningItems) {
      const lt = Number(ri.total_price ?? 0);
      const cfg =
        ri.product_config &&
        typeof ri.product_config === "object" &&
        !Array.isArray(ri.product_config)
          ? (ri.product_config as { gst_rate?: unknown })
          : {};
      runningGross += lt;
      runningGst += splitGst(lt, Number(cfg.gst_rate ?? 5));
    }

    const discount = Math.min(
      runningGross,
      Math.max(0, round2(Number(input.posDiscountAmount ?? 0))),
    );
    const netBeforeRound = Math.max(0, runningGross - discount);
    const roundedTotal = Math.max(1, Math.round(netBeforeRound));
    const rounding = round2(roundedTotal - netBeforeRound);

    const resolvedTableId = isUuid(input.posTabId)
      ? input.posTabId
      : runningOrder.table_id;

    return {
      ok: true,
      draft: {
        outlet_id: input.outletId,
        restaurant_slug: input.restaurantSlug,
        table_id: resolvedTableId,
        existing_order_id: runningOrder.id,
        pos_tab_id: isUuid(input.posTabId) ? input.posTabId : null,
        source: "pos",
        customer_name:
          input.customerName.trim() || runningOrder.customer_name || "Table",
        customer_email: input.customerEmail.trim() || "pos+online@billjot.local",
        customer_phone: cleanText(input.customerPhone, 30),
        order_type: "dine-in",
        instructions:
          cleanText(input.instructions, 500) ?? runningOrder.instructions,
        subtotal: round2(runningGross - runningGst),
        cgst: round2(runningGst / 2),
        sgst: round2(runningGst / 2),
        takeaway_charges: 0,
        discount_amount: discount,
        rounding_amount: rounding,
        total_amount: roundedTotal,
        items: runningItems.map((ri) => ({
          product_config: ri.product_config,
          quantity: ri.quantity,
          unit_price: Number(ri.unit_price),
          total_price: Number(ri.total_price),
          instructions: ri.instructions,
        })),
      },
    };
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Cart is empty" };
  }

  type CfgShape = {
    product_id?: string;
    name?: string;
    selected_options?: Array<{
      option_id?: string;
      quantity?: number;
    }>;
  };

  const configs: CfgShape[] = input.items.map((it) =>
    it.product_config &&
    typeof it.product_config === "object" &&
    !Array.isArray(it.product_config)
      ? (it.product_config as CfgShape)
      : {},
  );

  const productIds = [
    ...new Set(configs.map((c) => c.product_id).filter(isUuid)),
  ];
  if (productIds.length === 0) {
    return { ok: false, error: "No valid menu items selected" };
  }

  const [productsRes, linksRes] = await Promise.all([
    admin
      .from("products")
      .select("id, name, price, gst_rate, hsn_code, status")
      .eq("outlet_id", input.outletId)
      .in("id", productIds),
    admin
      .from("product_customizations")
      .select("product_id, group_id, sort_order, is_required_override")
      .in("product_id", productIds),
  ]);

  if (productsRes.error || linksRes.error) {
    return { ok: false, error: "Unable to verify menu catalog" };
  }

  const prodById = new Map(productsRes.data.map((p) => [p.id, p]));
  const linkedGroupIds = [...new Set(linksRes.data.map((l) => l.group_id))];

  let groupRows: ModifierGroupData[] = [];
  let optRows: ModifierOptionData[] = [];
  if (linkedGroupIds.length > 0) {
    const [groupsRes, optsRes] = await Promise.all([
      admin
        .from("customization_groups")
        .select(
          "id, name, display_name, selection_type, is_required, min_selections, max_selections, free_selections, sort_order",
        )
        .in("id", linkedGroupIds)
        .eq("status", "active"),
      admin
        .from("customization_options")
        .select(
          "id, name, price, group_id, veg_status, is_default, max_qty, variant_prices, sort_order",
        )
        .in("group_id", linkedGroupIds)
        .eq("status", "active"),
    ]);
    if (groupsRes.error || optsRes.error) {
      return { ok: false, error: "Unable to verify menu modifiers" };
    }
    groupRows = (groupsRes.data ?? []) as ModifierGroupData[];
    optRows = (optsRes.data ?? []) as ModifierOptionData[];
  }

  const modifiersByProduct = buildModifiersByProductMap({
    links: linksRes.data,
    groups: groupRows,
    options: optRows,
  });

  let runningGross = 0;
  let runningGst = 0;
  const outItems: VerifiedOrderDraft["items"] = [];

  for (let i = 0; i < input.items.length; i++) {
    const cfg = configs[i];
    const prod = cfg.product_id ? prodById.get(cfg.product_id) : undefined;
    if (!prod || prod.status !== "active") {
      return {
        ok: false,
        error: `"${cfg.name ?? "Item"}" is no longer available`,
      };
    }
    const qty = Math.max(1, Math.floor(Number(input.items[i].quantity) || 1));
    const offered = modifiersByProduct[prod.id]?.groups ?? [];
    const evalRes = evaluateProductCustomizations(
      prod.name,
      offered,
      Array.isArray(cfg.selected_options) ? cfg.selected_options : [],
    );
    if (!evalRes.ok) {
      return { ok: false, error: evalRes.error };
    }

    const base = Number(prod.price) || 0;
    const unit = base + evalRes.optionsTotal;
    const lineTotal = unit * qty;
    runningGross += lineTotal;
    runningGst += splitGst(lineTotal, Number(prod.gst_rate ?? 5));

    outItems.push({
      quantity: qty,
      unit_price: round2(unit),
      total_price: round2(lineTotal),
      instructions: cleanText(input.items[i].instructions, 200),
      product_config: {
        product_id: prod.id,
        name: prod.name,
        base_price: base,
        gst_rate: Number(prod.gst_rate ?? 5),
        hsn_code: prod.hsn_code ?? null,
        selected_options: evalRes.selectedOptions,
      } as Json,
    });
  }

  const packing =
    input.orderType === "takeaway"
      ? Math.max(0, Number(input.takeawayCharges ?? 15))
      : Math.max(0, Number(input.takeawayCharges ?? 0));

  const rawDiscount =
    input.source === "pos"
      ? Number(input.posDiscountAmount ?? 0)
      : await resolveOrderCouponDiscount(
          admin,
          input.outletId,
          input.couponCode,
          runningGross,
          "storefront",
        );

  const discount = Math.min(runningGross, Math.max(0, round2(rawDiscount)));
  const rounding =
    input.source === "pos"
      ? Math.max(-1, Math.min(1, round2(Number(input.posRoundingAmount ?? 0))))
      : 0;
  const netTotal = round2(Math.max(1, runningGross + packing - discount + rounding));

  const resolvedCustomerName = input.customerName.trim() || "Guest";
  const resolvedTableId =
    normalizedOrderType === "dine-in"
      ? await resolvePaymentTableId(
          admin,
          input.outletId,
          input.tableId ?? input.posTabId,
          resolvedCustomerName,
        )
      : null;

  return {
    ok: true,
    draft: {
      outlet_id: input.outletId,
      restaurant_slug: input.restaurantSlug,
      table_id: resolvedTableId,
      customer_account_id: isUuid(input.customerAccountId) ? input.customerAccountId : null,
      pos_tab_id: isUuid(input.posTabId) ? input.posTabId : null,
      coupon_code:
        discount > 0 && input.couponCode ? input.couponCode.trim().toUpperCase() : null,
      source: input.source,
      customer_name: resolvedCustomerName,
      customer_email: input.customerEmail.trim() || "guest@billjot.local",
      customer_phone: cleanText(input.customerPhone, 30),
      order_type: normalizedOrderType,
      instructions: cleanText(input.instructions, 500),
      subtotal: round2(runningGross - runningGst),
      cgst: round2(runningGst / 2),
      sgst: round2(runningGst / 2),
      takeaway_charges: packing,
      discount_amount: discount,
      rounding_amount: rounding,
      total_amount: netTotal,
      items: outItems,
    },
  };
}

function newOrderNumber() {
  const suffix = randomInt(36 ** 3)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `BJ-${Date.now()}-${suffix}`;
}

export async function finalizePaidOrderFromSession(params: {
  sessionReference: string;
  gateway: "razorpay" | "stripe";
  paymentId: string;
  razorpayOrderId?: string;
}): Promise<{ ok: true; order: Record<string, unknown> } | { ok: false; error: string }> {
  const admin = createAdminClient();

  // 1. Idempotency check: did webhook or redirect already finalize this order?
  if (params.razorpayOrderId) {
    const { data: existingRzp } = await admin
      .from("orders")
      .select("*")
      .eq("razorpay_order_id", params.razorpayOrderId)
      .maybeSingle();
    if (existingRzp) return { ok: true, order: existingRzp };
  }

  const extRef = `${params.gateway}:${params.sessionReference}`;
  const { data: existingExt } = await admin
    .from("orders")
    .select("*")
    .eq("external_order_id", extRef)
    .maybeSingle();
  if (existingExt) return { ok: true, order: existingExt };

  // 2. Load pending payment_session
  const { data: sessionRow } = await admin
    .from("payment_sessions")
    .select("*")
    .eq("order_reference", params.sessionReference)
    .maybeSingle();

  if (!sessionRow || !sessionRow.order_data) {
    return { ok: false, error: "Payment session expired or not found" };
  }

  const draft = sessionRow.order_data as unknown as VerifiedOrderDraft;
  const tokenNumber = randomInt(101, 999);

  const paymentMeta = {
    gateway: params.gateway,
    paid: true,
    payment_id: params.paymentId,
    session_reference: params.sessionReference,
    paid_at: new Date().toISOString(),
  };

  // Settling an existing running table order in place
  if (draft.existing_order_id && isUuid(draft.existing_order_id)) {
    const { data: existingRunning } = await admin
      .from("orders")
      .select("*")
      .eq("id", draft.existing_order_id)
      .maybeSingle();

    if (!existingRunning) {
      return { ok: false, error: "Running order not found" };
    }
    if (existingRunning.customer_email !== RUNNING_POS_ORDER_EMAIL) {
      return { ok: true, order: existingRunning };
    }

    const { data: settledOrder, error: settleErr } = await admin
      .from("orders")
      .update({
        table_id: draft.table_id ?? existingRunning.table_id,
        customer_name: draft.customer_name || existingRunning.customer_name,
        customer_email: draft.customer_email,
        discount_amount: draft.discount_amount,
        rounding_amount: draft.rounding_amount,
        total_amount: draft.total_amount,
        payment_status: "paid",
        payment_provider: params.gateway,
        payment_mode: params.gateway,
        razorpay_order_id: params.razorpayOrderId ?? null,
        external_order_id: extRef,
        external_status: "paid",
        external_payload: paymentMeta as unknown as Json,
        ...(draft.instructions ? { instructions: draft.instructions } : {}),
      })
      .eq("id", draft.existing_order_id)
      .select("*")
      .single();

    if (settleErr || !settledOrder) {
      return {
        ok: false,
        error: settleErr?.message ?? "Failed to settle running order",
      };
    }

    if (draft.pos_tab_id && isUuid(draft.pos_tab_id)) {
      await admin
        .from("pos_tabs")
        .update({
          lines: [],
          order_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.pos_tab_id);
    }

    if (settledOrder.customer_phone) {
      const { data: outletRow } = await admin
        .from("outlets")
        .select("restaurant_id")
        .eq("id", settledOrder.outlet_id)
        .maybeSingle();
      if (outletRow) {
        await applyOrderLoyaltyOnSettlement(admin, {
          restaurantId: outletRow.restaurant_id,
          outletId: settledOrder.outlet_id,
          orderId: settledOrder.id,
          customerPhone: settledOrder.customer_phone,
          customerName: settledOrder.customer_name,
          customerEmail: settledOrder.customer_email,
          orderSubtotal: Number(settledOrder.subtotal ?? settledOrder.total_amount ?? 0),
          netPaidAmount: Number(settledOrder.total_amount ?? 0),
        });
      }
    }

    void dispatchOrderStatusWebhooks(settledOrder.id, "order.updated");
    void deductOrderRecipeStock({
      orderId: settledOrder.id,
      outletId: settledOrder.outlet_id,
    });
    return { ok: true, order: settledOrder };
  }

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      outlet_id: draft.outlet_id,
      table_id: draft.table_id ?? null,
      customer_account_id: draft.customer_account_id ?? null,
      source: draft.source,
      customer_name: draft.customer_name,
      customer_email: draft.customer_email,
      customer_phone: draft.customer_phone,
      order_type: draft.order_type,
      subtotal: draft.subtotal,
      cgst_amount: draft.cgst,
      sgst_amount: draft.sgst,
      gst_paid_by_operator: false,
      takeaway_charges: draft.takeaway_charges,
      discount_amount: draft.discount_amount,
      rounding_amount: draft.rounding_amount,
      total_amount: draft.total_amount,
      token_number: tokenNumber,
      status: "confirmed",
      payment_status: "paid",
      payment_provider: params.gateway,
      payment_mode: params.gateway,
      unique_order_id: newOrderNumber(),
      razorpay_order_id: params.razorpayOrderId ?? null,
      external_order_id: extRef,
      external_status: "paid",
      external_payload: paymentMeta as unknown as Json,
      ...(draft.instructions ? { instructions: draft.instructions } : {}),
    })
    .select("*")
    .single();

  if (orderErr || !order) {
    // Handle race condition if webhook inserted simultaneously
    if (orderErr?.code === "23505") {
      const { data: raced } = await admin
        .from("orders")
        .select("*")
        .eq("external_order_id", extRef)
        .maybeSingle();
      if (raced) return { ok: true, order: raced };
    }
    return { ok: false, error: orderErr?.message ?? "Failed to create order" };
  }

  const anyItemNote = draft.items.some((it) => it.instructions);
  const { data: insertedItems, error: itemsErr } = await admin
    .from("order_items")
    .insert(
      draft.items.map((it) => ({
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
    await admin.from("orders").delete().eq("id", order.id);
    return { ok: false, error: itemsErr.message };
  }

  // Create station-routed KOT tickets in KDS
  if (insertedItems && insertedItems.length > 0) {
    await insertRoutedKotTickets(admin, {
      outletId: draft.outlet_id,
      orderId: order.id,
      tokenNumber,
      notes: draft.instructions,
      insertedItems,
    });
  }

  if (draft.coupon_code && draft.discount_amount > 0) {
    void recordCouponRedemption(admin, draft.outlet_id, draft.coupon_code);
  }
  if (draft.customer_phone) {
    const { data: outletRow } = await admin
      .from("outlets")
      .select("restaurant_id")
      .eq("id", draft.outlet_id)
      .maybeSingle();
    if (outletRow) {
      await applyOrderLoyaltyOnSettlement(admin, {
        restaurantId: outletRow.restaurant_id,
        outletId: draft.outlet_id,
        orderId: order.id,
        customerPhone: draft.customer_phone,
        customerName: draft.customer_name,
        customerEmail: draft.customer_email,
        orderSubtotal: Number(draft.subtotal ?? draft.total_amount ?? 0),
        netPaidAmount: Number(draft.total_amount ?? 0),
      });
    }
  }
  void deductOrderRecipeStock({ orderId: order.id, outletId: draft.outlet_id });
  void dispatchOrderStatusWebhooks(order.id, "order.created");
  return { ok: true, order };
}

// ---------------------------------------------------------------------------
// Cryptographic Signature Verification (Razorpay & Stripe)
// ---------------------------------------------------------------------------
export function verifyHmacHex(
  payload: string,
  secret: string,
  expectedHex: string,
): boolean {
  if (!secret || !expectedHex) return false;
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(expectedHex.trim(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyStripeWebhookSignature(
  rawBody: string,
  sigHeader: string,
  webhookSecret: string,
  toleranceSec = 300,
): boolean {
  if (!sigHeader || !webhookSecret) return false;
  const parts = sigHeader.split(",").map((p) => p.trim());
  const tsPart = parts.find((p) => p.startsWith("t="));
  const v1Parts = parts.filter((p) => p.startsWith("v1="));
  if (!tsPart || v1Parts.length === 0) return false;

  const timestamp = Number(tsPart.slice(2));
  if (!Number.isFinite(timestamp)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > toleranceSec) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  return v1Parts.some((v1) =>
    verifyHmacHex(signedPayload, webhookSecret, v1.slice(3)),
  );
}
