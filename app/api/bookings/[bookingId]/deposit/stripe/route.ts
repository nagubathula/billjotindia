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

function sanitizeCustomRedirectUrl(
  raw: string | undefined,
  ensureSessionPlaceholder = false,
): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
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

export async function POST(request: Request, props: Props) {
  const { bookingId } = await props.params;
  const originHeader = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(originHeader, "POST, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `bk-str-create:ip:${ip}`,
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
      originHeader,
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
    success_url?: string;
    cancel_url?: string;
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
    !gatewayCfg.secrets.stripeEnabled ||
    !gatewayCfg.secrets.stripeSecretKey
  ) {
    return fail(400, "Stripe is not enabled for this outlet");
  }

  const { data: rest } = await admin
    .from("restaurants")
    .select("slug, name")
    .eq("id", booking.restaurant_id)
    .maybeSingle();
  const restaurantSlug = rest?.slug ?? "";
  if (!restaurantSlug) return fail(400, "Restaurant not found");

  const customSuccess = sanitizeCustomRedirectUrl(body.success_url, true);
  const customCancel = sanitizeCustomRedirectUrl(body.cancel_url, false);
  if (body.success_url && !customSuccess) return fail(400, "Invalid success_url");
  if (body.cancel_url && !customCancel) return fail(400, "Invalid cancel_url");

  const origin =
    originHeader || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const encodedCode = encodeURIComponent(booking.booking_code);
  const encodedSlug = encodeURIComponent(restaurantSlug);

  const successUrl =
    customSuccess ??
    `${origin}/r/${encodedSlug}/book?code=${encodedCode}&booking_id=${booking.id}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    customCancel ??
    `${origin}/r/${encodedSlug}/book?code=${encodedCode}&booking_id=${booking.id}&cancelled=1`;

  const amountPaise = Math.max(5000, Math.round(amount * 100));
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  if (booking.customer_email) {
    params.set("customer_email", booking.customer_email);
  }
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "inr");
  params.set("line_items[0][price_data][unit_amount]", String(amountPaise));
  params.set(
    "line_items[0][price_data][product_data][name]",
    `Table Reservation Cover Charge (${booking.party_size} guests)`,
  );
  params.set(
    "line_items[0][price_data][product_data][description]",
    `${rest?.name ?? "Restaurant"} · Ref ${booking.booking_code}`,
  );
  params.set("metadata[outlet_id]", booking.outlet_id);
  params.set("metadata[booking_id]", booking.id);
  params.set("metadata[booking_code]", booking.booking_code);

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
    return fail(502, "Unable to reach Stripe API");
  }

  const stripeJson = (await stripeRes.json().catch(() => ({}))) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!stripeRes.ok || !stripeJson.id || !stripeJson.url) {
    return fail(
      400,
      stripeJson.error?.message ?? "Stripe rejected Checkout Session creation",
    );
  }

  const sessionData: BookingDepositSessionData = {
    kind: "table_booking_deposit",
    booking_id: booking.id,
    outlet_id: booking.outlet_id,
    restaurant_slug: restaurantSlug,
    amount,
  };

  const { error: sessErr } = await admin.from("payment_sessions").insert({
    order_reference: stripeJson.id,
    order_data: sessionData as unknown as Json,
    expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
  if (sessErr) return fail(500, "Failed to persist Stripe payment session");

  return NextResponse.json(
    { sessionId: stripeJson.id, url: stripeJson.url },
    { headers: cors },
  );
}
