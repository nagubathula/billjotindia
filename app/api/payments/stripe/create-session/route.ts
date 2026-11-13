import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildVerifiedOrderDraft,
  getOutletGatewayConfig,
  type CheckoutItemInput,
} from "@/lib/payments";
import type { Json } from "@/lib/database.types";

type CreateStripeBody = {
  outlet_id: string;
  restaurant_slug: string;
  return_context?: "storefront" | "pos";
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

export async function POST(request: Request) {
  let body: CreateStripeBody;
  try {
    body = (await request.json()) as CreateStripeBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 },
    );
  }

  if (!body?.outlet_id || !body?.restaurant_slug || !body?.customer_name) {
    return NextResponse.json(
      { error: "Missing outlet, slug, or customer details" },
      { status: 400 },
    );
  }

  const gatewayCfg = await getOutletGatewayConfig(body.outlet_id);
  if (
    !gatewayCfg.onlineEnabled ||
    !gatewayCfg.secrets.stripeEnabled ||
    !gatewayCfg.secrets.stripeSecretKey
  ) {
    return NextResponse.json(
      {
        error:
          "Stripe is not enabled or configured for this outlet. Add Stripe API keys in Outlet Settings.",
      },
      { status: 400 },
    );
  }

  const verified = await buildVerifiedOrderDraft({
    outletId: body.outlet_id,
    restaurantSlug: body.restaurant_slug,
    source: body.source ?? "web",
    customerName: body.customer_name,
    customerEmail: body.customer_email || "guest@billjot.local",
    customerPhone: body.customer_phone,
    orderType: body.order_type || "dine-in",
    instructions: body.instructions,
    couponCode: body.coupon_code,
    posDiscountAmount: body.discount_amount,
    posRoundingAmount: body.rounding_amount,
    takeawayCharges: body.takeaway_charges,
    items: body.items,
  });

  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }

  const origin =
    request.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

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
  const successUrl = `${origin}/r/${encodeURIComponent(body.restaurant_slug)}/checkout/stripe-return?session_id={CHECKOUT_SESSION_ID}&ctx=${returnCtx}`;
  const cancelUrl =
    returnCtx === "pos"
      ? `${origin}/r/${encodeURIComponent(body.restaurant_slug)}/pos`
      : `${origin}/r/${encodeURIComponent(body.restaurant_slug)}/checkout?cancelled=1`;

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
  params.set("metadata[outlet_id]", body.outlet_id);
  params.set("metadata[restaurant_slug]", body.restaurant_slug);

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
    return NextResponse.json(
      { error: "Unable to reach Stripe API. Check network connectivity." },
      { status: 502 },
    );
  }

  const stripeJson = (await stripeRes.json().catch(() => ({}))) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };

  if (!stripeRes.ok || !stripeJson.id || !stripeJson.url) {
    return NextResponse.json(
      {
        error:
          stripeJson.error?.message ??
          "Stripe rejected Checkout Session creation. Verify your Stripe Secret Key.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const { error: sessErr } = await admin.from("payment_sessions").insert({
    order_reference: stripeJson.id,
    order_data: verified.draft as unknown as Json,
    expires_at: expiresAt,
  });

  if (sessErr) {
    return NextResponse.json(
      { error: "Failed to persist Stripe payment session" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    sessionId: stripeJson.id,
    url: stripeJson.url,
  });
}
