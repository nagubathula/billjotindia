import { NextResponse } from "next/server";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import {
  authenticateApiKey,
  keyCoversOutlet,
  presentedApiKey,
  type ApiKeyContext,
} from "@/lib/api-keys";
import { checkPosBillingAccess } from "@/lib/pos-auth";
import {
  buildVerifiedOrderDraft,
  getOutletGatewayConfig,
  type CheckoutItemInput,
} from "@/lib/payments";
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { resolveOptionalCustomerIdForOrder } from "@/lib/storefront-customers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

type CreateStripeBody = {
  outlet_id?: string;
  restaurant_slug?: string;
  table_id?: string | null;
  table_code?: string | null;
  existing_order_id?: string | null;
  pos_tab_id?: string | null;
  return_context?: "storefront" | "pos";
  success_url?: string;
  cancel_url?: string;
  source?: "web" | "pos" | "kiosk";
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  order_type: string;
  instructions?: string | null;
  coupon_code?: string | null;
  discount_amount?: number;
  rounding_amount?: number;
  takeaway_charges?: number;
  items: CheckoutItemInput[];
};

function sanitizeCustomRedirectUrl(
  raw: string | undefined,
  ensureSessionPlaceholder = false,
): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  // Stripe substitutes {CHECKOUT_SESSION_ID}; temporarily replace before URL validation
  const probe = trimmed.replaceAll("{CHECKOUT_SESSION_ID}", "cs_placeholder");
  try {
    const u = new URL(probe);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (!ensureSessionPlaceholder || trimmed.includes("{CHECKOUT_SESSION_ID}")) {
      return trimmed;
    }
    const sep = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${sep}session_id={CHECKOUT_SESSION_ID}`;
  } catch {
    return null;
  }
}

export async function OPTIONS(request: Request) {
  const headers = await preflightCorsHeaders(request, "POST, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const originHeader = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(originHeader, "POST, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `pay-stripe-create:ip:${ip}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many payment attempts. Please wait a minute." },
      { status: 429, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
    );
  }

  let apiKey: ApiKeyContext | null = null;
  if (presentedApiKey(request)) {
    const check = await authenticateApiKey(request, "orders:write");
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error },
        { status: check.status, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
      );
    }
    apiKey = check.key;
    cors = apiCorsHeaders(
      originHeader,
      "POST, OPTIONS",
      apiKey.allowedOrigins,
      request.url,
    );
  }
  cors = { ...cors, ...rateLimitHeaders(ipLimit) };
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: cors });

  let body: CreateStripeBody;
  try {
    body = (await request.json()) as CreateStripeBody;
  } catch {
    return fail(400, "Invalid JSON request body");
  }

  const outletId = body?.outlet_id || apiKey?.outletId || "";
  if (!outletId || !body?.customer_name) {
    return fail(400, "Missing outlet or customer details");
  }

  const source = body.source ?? "web";
  if (apiKey && source === "pos") {
    return fail(403, "API keys can create web or kiosk payment sessions only");
  }

  // POS payments carry a cashier's discount: staff who can bill only.
  if (source === "pos") {
    const access = await checkPosBillingAccess(outletId);
    if (!access.ok) {
      return fail(access.status, access.error);
    }
  }

  const admin = createAdminClient();
  let restaurantSlug = body.restaurant_slug?.trim() || "";
  if (apiKey || !restaurantSlug) {
    const { data: outlet } = await admin
      .from("outlets")
      .select("id, restaurant_id")
      .eq("id", outletId)
      .maybeSingle();
    if (!outlet) {
      return fail(400, "Outlet not found");
    }
    if (apiKey && !keyCoversOutlet(apiKey, outlet)) {
      return fail(403, "This API key can't create payments for that outlet");
    }
    if (!restaurantSlug) {
      const { data: rest } = await admin
        .from("restaurants")
        .select("slug")
        .eq("id", outlet.restaurant_id)
        .maybeSingle();
      restaurantSlug = rest?.slug ?? "";
    }
  }

  if (!restaurantSlug) {
    return fail(400, "Missing restaurant slug");
  }

  const gatewayCfg = await getOutletGatewayConfig(outletId);
  if (
    !gatewayCfg.onlineEnabled ||
    !gatewayCfg.secrets.stripeEnabled ||
    !gatewayCfg.secrets.stripeSecretKey
  ) {
    return fail(
      400,
      "Stripe is not enabled or configured for this outlet. Add Stripe API keys in Outlet Settings.",
    );
  }

  const customerAccountId =
    source !== "pos"
      ? await resolveOptionalCustomerIdForOrder(request, outletId)
      : null;

  const verified = await buildVerifiedOrderDraft({
    outletId,
    restaurantSlug,
    tableId: body.table_id ?? body.table_code,
    customerAccountId,
    existingOrderId: source === "pos" ? body.existing_order_id : null,
    posTabId: source === "pos" ? body.pos_tab_id : null,
    source,
    customerName: body.customer_name,
    customerEmail: body.customer_email || "guest@billjot.local",
    customerPhone: body.customer_phone,
    orderType: body.order_type || "dine-in",
    instructions: body.instructions,
    couponCode: body.coupon_code,
    posDiscountAmount: source === "pos" ? body.discount_amount : 0,
    posRoundingAmount: source === "pos" ? body.rounding_amount : 0,
    takeawayCharges: body.takeaway_charges,
    items: body.items,
  });

  if (!verified.ok) {
    return fail(400, verified.error);
  }

  const origin =
    originHeader || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const amountPaise = Math.max(
    5000, // Stripe INR minimum is ~₹50 ($0.50 USD equivalent)
    Math.round(verified.draft.total_amount * 100),
  );

  const itemSummary = verified.draft.items
    .slice(0, 4)
    .map((it) => {
      const cfg = it.product_config as { name?: string };
      return `${it.quantity}x ${cfg.name ?? "Item"}`;
    })
    .join(", ");

  const returnCtx = body.return_context === "pos" ? "pos" : "storefront";
  const customSuccess = sanitizeCustomRedirectUrl(body.success_url, true);
  const customCancel = sanitizeCustomRedirectUrl(body.cancel_url, false);
  if (body.success_url && !customSuccess) {
    return fail(400, "Invalid success_url");
  }
  if (body.cancel_url && !customCancel) {
    return fail(400, "Invalid cancel_url");
  }

  const successUrl =
    customSuccess ??
    `${origin}/r/${encodeURIComponent(restaurantSlug)}/checkout/stripe-return?session_id={CHECKOUT_SESSION_ID}&ctx=${returnCtx}`;
  const cancelUrl =
    customCancel ??
    (returnCtx === "pos"
      ? `${origin}/r/${encodeURIComponent(restaurantSlug)}/pos`
      : `${origin}/r/${encodeURIComponent(restaurantSlug)}/checkout?cancelled=1`);

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  if (
    verified.draft.customer_email &&
    !verified.draft.customer_email.endsWith(".local")
  ) {
    params.set("customer_email", verified.draft.customer_email);
  }
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "inr");
  params.set("line_items[0][price_data][unit_amount]", String(amountPaise));
  params.set(
    "line_items[0][price_data][product_data][name]",
    `Restaurant Order (${verified.draft.order_type})`,
  );
  if (itemSummary) {
    params.set(
      "line_items[0][price_data][product_data][description]",
      itemSummary.slice(0, 240),
    );
  }
  params.set("metadata[outlet_id]", outletId);
  params.set("metadata[restaurant_slug]", restaurantSlug);

  let stripeRes: Response;
  try {
    stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gatewayCfg.secrets.stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch {
    return fail(502, "Unable to reach Stripe API. Check network connectivity.");
  }

  const stripeJson = (await stripeRes.json().catch(() => ({}))) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };

  if (!stripeRes.ok || !stripeJson.id || !stripeJson.url) {
    return fail(
      400,
      stripeJson.error?.message ??
        "Stripe rejected Checkout Session creation. Verify your Stripe Secret Key.",
    );
  }

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const { error: sessErr } = await admin.from("payment_sessions").insert({
    order_reference: stripeJson.id,
    order_data: verified.draft as unknown as Json,
    expires_at: expiresAt,
  });

  if (sessErr) {
    return fail(500, "Failed to persist Stripe payment session");
  }

  return NextResponse.json(
    {
      sessionId: stripeJson.id,
      url: stripeJson.url,
    },
    { headers: cors },
  );
}
