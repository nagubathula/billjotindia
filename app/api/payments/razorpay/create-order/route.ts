import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildVerifiedOrderDraft,
  getOutletGatewayConfig,
  type CheckoutItemInput,
} from "@/lib/payments";
import type { Json } from "@/lib/database.types";

type CreateRazorpayBody = {
  outlet_id: string;
  restaurant_slug?: string;
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
  let body: CreateRazorpayBody;
  try {
    body = (await request.json()) as CreateRazorpayBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 },
    );
  }

  if (!body?.outlet_id || !body?.customer_name) {
    return NextResponse.json(
      { error: "Missing outlet or customer details" },
      { status: 400 },
    );
  }

  const gatewayCfg = await getOutletGatewayConfig(body.outlet_id);
  if (
    !gatewayCfg.onlineEnabled ||
    !gatewayCfg.secrets.razorpayEnabled ||
    !gatewayCfg.secrets.razorpayKeyId ||
    !gatewayCfg.secrets.razorpayKeySecret
  ) {
    return NextResponse.json(
      {
        error:
          "Razorpay is not enabled or configured for this outlet. Add Razorpay API keys in Outlet Settings.",
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
          outlet_id: body.outlet_id,
          customer_name: verified.draft.customer_name.slice(0, 80),
          order_type: verified.draft.order_type,
        },
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to reach Razorpay API. Check network connectivity." },
      { status: 502 },
    );
  }

  const rzpJson = (await rzpRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { description?: string };
  };

  if (!rzpRes.ok || !rzpJson.id) {
    return NextResponse.json(
      {
        error:
          rzpJson.error?.description ??
          "Razorpay rejected order creation. Verify Key ID and Key Secret.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { error: sessErr } = await admin.from("payment_sessions").insert({
    order_reference: rzpJson.id,
    order_data: verified.draft as unknown as Json,
    expires_at: expiresAt,
  });

  if (sessErr) {
    return NextResponse.json(
      { error: "Failed to persist payment session" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    razorpayOrderId: rzpJson.id,
    amountPaise,
    currency: "INR",
    keyId: gatewayCfg.secrets.razorpayKeyId,
  });
}
