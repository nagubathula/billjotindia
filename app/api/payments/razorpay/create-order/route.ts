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

type CreateRazorpayBody = {
  outlet_id?: string;
  restaurant_slug?: string;
  table_id?: string | null;
  table_code?: string | null;
  existing_order_id?: string | null;
  pos_tab_id?: string | null;
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

export async function OPTIONS(request: Request) {
  const headers = await preflightCorsHeaders(request, "POST, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(origin, "POST, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `pay-rzp-create:ip:${ip}`,
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
    cors = apiCorsHeaders(origin, "POST, OPTIONS", apiKey.allowedOrigins, request.url);
  }
  cors = { ...cors, ...rateLimitHeaders(ipLimit) };
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: cors });

  let body: CreateRazorpayBody;
  try {
    body = (await request.json()) as CreateRazorpayBody;
  } catch {
    return fail(400, "Invalid JSON request body");
  }

  const outletId = body?.outlet_id || apiKey?.outletId || "";
  if (!outletId || !body?.customer_name) {
    return fail(400, "Missing outlet or customer details");
  }

  const source = body.source ?? "web";
  if (apiKey && source === "pos") {
    return fail(403, "API keys can create web or kiosk payment orders only");
  }

  // POS payments carry a cashier's discount: staff who can bill only.
  if (source === "pos") {
    const access = await checkPosBillingAccess(outletId);
    if (!access.ok) {
      return fail(access.status, access.error);
    }
  }

  const admin = createAdminClient();
  if (apiKey) {
    const { data: outlet } = await admin
      .from("outlets")
      .select("id, restaurant_id")
      .eq("id", outletId)
      .maybeSingle();
    if (!outlet || !keyCoversOutlet(apiKey, outlet)) {
      return fail(403, "This API key can't create payments for that outlet");
    }
  }

  const gatewayCfg = await getOutletGatewayConfig(outletId);
  if (
    !gatewayCfg.onlineEnabled ||
    !gatewayCfg.secrets.razorpayEnabled ||
    !gatewayCfg.secrets.razorpayKeyId ||
    !gatewayCfg.secrets.razorpayKeySecret
  ) {
    return fail(
      400,
      "Razorpay is not enabled or configured for this outlet. Add Razorpay API keys in Outlet Settings.",
    );
  }

  const customerAccountId =
    source !== "pos"
      ? await resolveOptionalCustomerIdForOrder(request, outletId)
      : null;

  const verified = await buildVerifiedOrderDraft({
    outletId,
    restaurantSlug: body.restaurant_slug,
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

  const amountPaise = Math.max(
    100,
    Math.round(verified.draft.total_amount * 100),
  );
  const receipt = `rcpt_${Date.now()}`;
  const authHeader = Buffer.from(
    `${gatewayCfg.secrets.razorpayKeyId}:${gatewayCfg.secrets.razorpayKeySecret}`,
  ).toString("base64");

  let rzpRes: Response;
  try {
    rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: {
          outlet_id: outletId,
          customer_name: verified.draft.customer_name.slice(0, 80),
          order_type: verified.draft.order_type,
        },
      }),
    });
  } catch {
    return fail(502, "Unable to reach Razorpay API. Check network connectivity.");
  }

  const rzpJson = (await rzpRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { description?: string };
  };

  if (!rzpRes.ok || !rzpJson.id) {
    return fail(
      400,
      rzpJson.error?.description ??
        "Razorpay rejected order creation. Verify Key ID and Key Secret.",
    );
  }

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { error: sessErr } = await admin.from("payment_sessions").insert({
    order_reference: rzpJson.id,
    order_data: verified.draft as unknown as Json,
    expires_at: expiresAt,
  });

  if (sessErr) {
    return fail(500, "Failed to persist payment session");
  }

  return NextResponse.json(
    {
      outletId,
      razorpayOrderId: rzpJson.id,
      amountPaise,
      totalAmount: verified.draft.total_amount,
      currency: "INR",
      keyId: gatewayCfg.secrets.razorpayKeyId,
    },
    { headers: cors },
  );
}
