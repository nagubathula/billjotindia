import { NextResponse } from "next/server";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import { authenticateApiKey, keyCoversOutlet } from "@/lib/api-keys";
import { loadTrackedOrderWithOutlet } from "@/lib/order-webhooks";
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { isUuid } from "@/lib/utils";

// GET /api/orders/{orderId} — an order's live status, for frontends that hold
// a restaurant API key with the "Place orders" permission (to show customers
// an order-tracking page). Orders of other restaurants, or of outlets the key
// doesn't cover, answer 404 as if they didn't exist.

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  const headers = await preflightCorsHeaders(request, "GET, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let headers = apiCorsHeaders(origin, "GET, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `order-status:ip:${ip}`,
    limit: 180,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many status requests. Please slow down." },
      { status: 429, headers: { ...headers, ...rateLimitHeaders(ipLimit) } },
    );
  }

  const check = await authenticateApiKey(request, "orders:write");
  if (!check.ok) {
    return NextResponse.json(
      { error: check.error },
      { status: check.status, headers: { ...headers, ...rateLimitHeaders(ipLimit) } },
    );
  }
  headers = apiCorsHeaders(
    origin,
    "GET, OPTIONS",
    check.key.allowedOrigins,
    request.url,
  );

  const { orderId } = await params;
  if (!isUuid(orderId)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404, headers });
  }

  const [keyLimit, pollLimit] = await Promise.all([
    checkRateLimit({
      bucket: `order-status:key:${check.key.id}`,
      limit: 240,
      windowSeconds: 60,
    }),
    checkRateLimit({
      bucket: `order-status:poll:${check.key.id}:${orderId}`,
      limit: 20,
      windowSeconds: 60,
    }),
  ]);
  const activeLimit = !pollLimit.allowed ? pollLimit : keyLimit;
  headers = { ...headers, ...rateLimitHeaders(activeLimit) };
  if (!activeLimit.allowed) {
    return NextResponse.json(
      { error: "Polling too frequently. Poll no more than once every few seconds." },
      { status: 429, headers },
    );
  }

  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers });

  const loaded = await loadTrackedOrderWithOutlet(orderId);
  if (!loaded || !keyCoversOutlet(check.key, loaded.outlet)) {
    return fail(404, "Order not found");
  }

  return NextResponse.json(
    { order: loaded.order },
    { headers: { ...headers, "Cache-Control": "no-store" } },
  );
}
