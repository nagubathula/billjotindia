import { NextResponse } from "next/server";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import {
  authenticateApiKeyAnyScope,
  keyCoversOutlet,
  presentedApiKey,
  type ApiKeyContext,
} from "@/lib/api-keys";
import type { BookingDepositSessionData } from "@/lib/booking-payments";
import { getOutletGatewayConfig } from "@/lib/payments";
import { checkRateLimit, clientIpFromRequest, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";
import type { Json } from "@/lib/database.types";

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
    bucket: `bk-rzp-create:ip:${ip}`,
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
    booking_code?: string;
  };

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("table_bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return fail(404, "Booking not found");

  if (apiKey) {
    if (
      !keyCoversOutlet(apiKey, {
        id: booking.outlet_id,
        restaurant_id: booking.restaurant_id,
      })
    ) {
      return fail(403, "This API key cannot pay deposits for that booking");
    }
  } else {
    const presentedCode = body.booking_code?.trim().toUpperCase() ?? "";
    if (!presentedCode || presentedCode !== booking.booking_code.toUpperCase()) {
      return fail(403, "Invalid booking code");
    }
  }

  if (booking.status === "cancelled" || booking.status === "no_show") {
    return fail(400, "Cannot pay deposit for a cancelled booking");
  }
  if (booking.deposit_status === "paid") {
    return fail(400, "Booking deposit is already paid");
  }
  const amount = Number(booking.deposit_amount ?? 0);
  if (amount <= 0) {
    return fail(400, "No deposit is due on this booking");
  }

  const gatewayCfg = await getOutletGatewayConfig(booking.outlet_id);
  if (
    !gatewayCfg.onlineEnabled ||
    !gatewayCfg.secrets.razorpayEnabled ||
    !gatewayCfg.secrets.razorpayKeyId ||
    !gatewayCfg.secrets.razorpayKeySecret
  ) {
    return fail(400, "Razorpay is not enabled for this outlet");
  }

  const [{ data: rest }] = await Promise.all([
    admin
      .from("restaurants")
      .select("slug")
      .eq("id", booking.restaurant_id)
      .maybeSingle(),
  ]);

  const amountPaise = Math.max(100, Math.round(amount * 100));
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
        receipt: `bk_${booking.booking_code}_${Date.now()}`.slice(0, 40),
        notes: {
          outlet_id: booking.outlet_id,
          booking_id: booking.id,
          booking_code: booking.booking_code,
        },
      }),
    });
  } catch {
    return fail(502, "Unable to reach Razorpay API");
  }

  const rzpJson = (await rzpRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { description?: string };
  };
  if (!rzpRes.ok || !rzpJson.id) {
    return fail(
      400,
      rzpJson.error?.description ?? "Razorpay rejected deposit order creation",
    );
  }

  const sessionData: BookingDepositSessionData = {
    kind: "table_booking_deposit",
    booking_id: booking.id,
    outlet_id: booking.outlet_id,
    restaurant_slug: rest?.slug ?? "",
    amount,
  };

  const { error: sessErr } = await admin.from("payment_sessions").insert({
    order_reference: rzpJson.id,
    order_data: sessionData as unknown as Json,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  if (sessErr) return fail(500, "Failed to persist payment session");

  return NextResponse.json(
    {
      bookingId: booking.id,
      outletId: booking.outlet_id,
      razorpayOrderId: rzpJson.id,
      amountPaise,
      totalAmount: amount,
      currency: "INR",
      keyId: gatewayCfg.secrets.razorpayKeyId,
    },
    { headers: cors },
  );
}
