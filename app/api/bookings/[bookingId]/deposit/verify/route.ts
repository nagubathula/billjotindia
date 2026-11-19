import { NextResponse } from "next/server";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import {
  authenticateApiKeyAnyScope,
  keyCoversOutlet,
  presentedApiKey,
  type ApiKeyContext,
} from "@/lib/api-keys";
import { finalizePaidBookingDeposit } from "@/lib/booking-payments";
import { getOutletGatewayConfig, verifyHmacHex } from "@/lib/payments";
import { checkRateLimit, clientIpFromRequest, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";

type Props = { params: Promise<{ bookingId: string }> };

export async function OPTIONS(request: Request) {
  const headers = await preflightCorsHeaders(request, "POST, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: Request, props: Props) {
  const { bookingId } = await props.params;
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(origin, "POST, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `bk-verify:ip:${ip}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many verification requests" },
      { status: 429, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
    );
  }

  let apiKey: ApiKeyContext | null = null;
  if (presentedApiKey(request)) {
    const check = await authenticateApiKeyAnyScope(request, [
      "bookings:write",
      "orders:write",
    ]);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error },
        { status: check.status, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
      );
    }
    apiKey = check.key;
    cors = apiCorsHeaders(
      origin,
      "POST, OPTIONS",
      apiKey.allowedOrigins,
      request.url,
    );
  }
  cors = { ...cors, ...rateLimitHeaders(ipLimit) };
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: cors });

  if (!isUuid(bookingId)) return fail(404, "Booking not found");

  const body = (await request.json().catch(() => ({}))) as {
    gateway?: "razorpay" | "stripe";
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    session_id?: string;
  };

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("table_bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return fail(404, "Booking not found");

  if (
    apiKey &&
    !keyCoversOutlet(apiKey, {
      id: booking.outlet_id,
      restaurant_id: booking.restaurant_id,
    })
  ) {
    return fail(403, "Forbidden for this outlet");
  }

  const gatewayCfg = await getOutletGatewayConfig(booking.outlet_id);

  // 1. Razorpay verification
  if (
    body.gateway === "razorpay" ||
    (body.razorpay_order_id && body.razorpay_payment_id && body.razorpay_signature)
  ) {
    const rzpOrderId = body.razorpay_order_id ?? "";
    const rzpPaymentId = body.razorpay_payment_id ?? "";
    const rzpSig = body.razorpay_signature ?? "";
    const secret = gatewayCfg.secrets.razorpayKeySecret;

    if (!rzpOrderId || !rzpPaymentId || !rzpSig || !secret) {
      return fail(400, "Missing Razorpay payment signature details");
    }

    if (!verifyHmacHex(`${rzpOrderId}|${rzpPaymentId}`, secret, rzpSig)) {
      return fail(401, "Invalid Razorpay signature");
    }

    const res = await finalizePaidBookingDeposit({
      sessionReference: rzpOrderId,
      gateway: "razorpay",
      paymentId: rzpPaymentId,
    });
    if (!res.ok) return fail(400, res.error);
    return NextResponse.json({ ok: true, booking: res.booking }, { headers: cors });
  }

  // 2. Stripe Checkout Session verification
  const sessionId = body.session_id ?? "";
  if (!sessionId) return fail(400, "Missing payment verification reference");

  const stripeSecret = gatewayCfg.secrets.stripeSecretKey;
  if (!stripeSecret) {
    return fail(400, "Stripe is not configured for this outlet");
  }

  let stripeRes: Response;
  try {
    stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${stripeSecret}` } },
    );
  } catch {
    return fail(502, "Unable to reach Stripe API");
  }

  const stripeJson = (await stripeRes.json().catch(() => ({}))) as {
    id?: string;
    payment_status?: string;
    payment_intent?: string;
  };
  if (!stripeRes.ok || stripeJson.payment_status !== "paid") {
    return fail(400, "Stripe payment is not marked paid yet");
  }

  const res = await finalizePaidBookingDeposit({
    sessionReference: sessionId,
    gateway: "stripe",
    paymentId: stripeJson.payment_intent || sessionId,
  });
  if (!res.ok) return fail(400, res.error);
  return NextResponse.json({ ok: true, booking: res.booking }, { headers: cors });
}
