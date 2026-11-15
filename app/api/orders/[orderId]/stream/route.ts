import { NextResponse } from "next/server";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import { authenticateApiKey, keyCoversOutlet } from "@/lib/api-keys";
import {
  createRealtimeServiceSubscriber,
  loadTrackedOrderWithOutlet,
} from "@/lib/order-webhooks";
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { isUuid } from "@/lib/utils";

// GET /api/orders/{orderId}/stream — Server-Sent Events (SSE) realtime push for
// an order's status so customer frontends don't have to poll.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  let cors = apiCorsHeaders(origin, "GET, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `order-stream:ip:${ip}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many stream connections. Please slow down." },
      { status: 429, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
    );
  }

  const check = await authenticateApiKey(request, "orders:write");
  if (!check.ok) {
    return NextResponse.json(
      { error: check.error },
      { status: check.status, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
    );
  }
  cors = apiCorsHeaders(
    origin,
    "GET, OPTIONS",
    check.key.allowedOrigins,
    request.url,
  );

  const { orderId } = await params;
  if (!isUuid(orderId)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404, headers: cors });
  }

  const loaded = await loadTrackedOrderWithOutlet(orderId);
  if (!loaded || !keyCoversOutlet(check.key, loaded.outlet)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404, headers: cors });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let maxLifetime: ReturnType<typeof setTimeout> | null = null;
  const rtClient = createRealtimeServiceSubscriber();
  let channel: ReturnType<typeof rtClient.channel> | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (maxLifetime) clearTimeout(maxLifetime);
    if (channel) {
      void rtClient.removeChannel(channel);
      channel = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendOrder = (order: typeof loaded.order) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: order\ndata: ${JSON.stringify({ order })}\n\n`),
          );
          if (order.status === "completed" || order.status === "cancelled") {
            cleanup();
            controller.close();
          }
        } catch {
          cleanup();
        }
      };

      // 1. Emit current snapshot immediately on connect
      sendOrder(loaded.order);
      if (closed) return;

      // 2. Subscribe to Supabase Realtime updates on this order row
      channel = rtClient
        .channel(`api-order-stream:${orderId}:${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "orders",
            filter: `id=eq.${orderId}`,
          },
          async () => {
            if (closed) return;
            const latest = await loadTrackedOrderWithOutlet(orderId);
            if (latest) sendOrder(latest.order);
          },
        )
        .subscribe();

      // 3. Keep connection alive across proxies & serverless gateways
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, 15_000);

      // Clean reconnect boundary at 4.5 minutes (EventSource auto-reconnects seamlessly)
      maxLifetime = setTimeout(() => {
        if (closed) return;
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }, 270_000);

      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      ...cors,
      ...rateLimitHeaders(ipLimit),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
