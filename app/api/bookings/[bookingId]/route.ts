import { NextResponse } from "next/server";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import {
  authenticateApiKeyAnyScope,
  keyCoversOutlet,
  presentedApiKey,
  type ApiKeyContext,
} from "@/lib/api-keys";
import { checkRateLimit, clientIpFromRequest, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";

type Props = { params: Promise<{ bookingId: string }> };

export async function OPTIONS(request: Request) {
  const headers = await preflightCorsHeaders(request, "GET, PATCH, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

export async function GET(request: Request, props: Props) {
  const { bookingId } = await props.params;
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(origin, "GET, PATCH, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `booking-id-get:ip:${ip}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
    );
  }

  let apiKey: ApiKeyContext | null = null;
  if (presentedApiKey(request)) {
    const check = await authenticateApiKeyAnyScope(request, [
      "bookings:read",
      "menu:read",
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
      "GET, PATCH, OPTIONS",
      apiKey.allowedOrigins,
      request.url,
    );
  }
  cors = { ...cors, ...rateLimitHeaders(ipLimit) };
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: cors });

  if (!isUuid(bookingId)) return fail(404, "Booking not found");

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
      return fail(403, "This API key cannot view that booking");
    }
  } else {
    const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase() ?? "";
    if (!code || code !== booking.booking_code.toUpperCase()) {
      return fail(403, "Invalid booking code");
    }
  }

  return NextResponse.json(
    {
      booking: {
        id: booking.id,
        booking_code: booking.booking_code,
        booking_type: booking.booking_type,
        status: booking.status,
        customer_name: booking.customer_name,
        party_size: booking.party_size,
        preferred_zone: booking.preferred_zone,
        occasion: booking.occasion,
        reserved_for: booking.reserved_for,
        duration_minutes: booking.duration_minutes,
        quoted_wait_minutes: booking.quoted_wait_minutes,
        queue_number: booking.queue_number,
        deposit_amount: Number(booking.deposit_amount ?? 0),
        deposit_status: booking.deposit_status,
        outlet_id: booking.outlet_id,
        table_id: booking.table_id,
      },
    },
    { headers: cors },
  );
}

export async function PATCH(request: Request, props: Props) {
  const { bookingId } = await props.params;
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(origin, "GET, PATCH, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `booking-id-patch:ip:${ip}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
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
      "GET, PATCH, OPTIONS",
      apiKey.allowedOrigins,
      request.url,
    );
  }
  cors = { ...cors, ...rateLimitHeaders(ipLimit) };
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: cors });

  if (!isUuid(bookingId)) return fail(404, "Booking not found");

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    booking_code?: string;
    phone?: string;
    cancel_reason?: string;
  };

  if (body.action !== "cancel") {
    return fail(400, "Unsupported action");
  }

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
      return fail(403, "This API key cannot modify that booking");
    }
  } else {
    const presentedCode = body.booking_code?.trim().toUpperCase() ?? "";
    const phoneDigits = (body.phone ?? "").replace(/[^\d]/g, "");
    const actualDigits = booking.customer_phone.replace(/[^\d]/g, "");
    if (
      !presentedCode ||
      presentedCode !== booking.booking_code.toUpperCase() ||
      phoneDigits.length < 4 ||
      phoneDigits.slice(-4) !== actualDigits.slice(-4)
    ) {
      return fail(403, "Booking code and phone verification required to cancel");
    }
  }

  if (booking.status === "seated" || booking.status === "completed") {
    return fail(400, "Cannot cancel a booking that has already been seated");
  }
  if (booking.status === "cancelled") {
    return NextResponse.json({ ok: true, booking }, { headers: cors });
  }

  const { data: updated, error } = await admin
    .from("table_bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: body.cancel_reason?.trim().slice(0, 200) || "Cancelled by guest",
    })
    .eq("id", booking.id)
    .select("*")
    .single();

  if (error || !updated) {
    return fail(500, error?.message ?? "Failed to cancel booking");
  }

  return NextResponse.json(
    {
      ok: true,
      booking: {
        id: updated.id,
        booking_code: updated.booking_code,
        status: updated.status,
      },
    },
    { headers: cors },
  );
}
