import { NextResponse } from "next/server";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import {
  authenticateApiKey,
  keyCoversOutlet,
  presentedApiKey,
  type ApiKeyContext,
} from "@/lib/api-keys";
import {
  finalizePaidOrderFromSession,
  getOutletGatewayConfig,
  type VerifiedOrderDraft,
} from "@/lib/payments";
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export async function OPTIONS(request: Request) {
  const headers = await preflightCorsHeaders(request, "POST, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(origin, "POST, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `pay-stripe-verify:ip:${ip}`,
    limit: 40,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many verification attempts. Please wait a minute." },
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

  let body: { session_id?: string };
  try {
    body = (await request.json()) as { session_id?: string };
  } catch {
    return fail(400, "Invalid JSON body");
  }

  const sessionId = body?.session_id?.trim();
  if (!sessionId) {
    return fail(400, "Missing Stripe session_id");
  }

  const admin = createAdminClient();
  const { data: sessionRow } = await admin
    .from("payment_sessions")
    .select("order_data")
    .eq("order_reference", sessionId)
    .maybeSingle();

  if (!sessionRow?.order_data) {
    return fail(404, "Stripe checkout session not found");
  }

  const draft = sessionRow.order_data as unknown as VerifiedOrderDraft;
  if (apiKey) {
    const { data: outlet } = await admin
      .from("outlets")
      .select("id, restaurant_id")
      .eq("id", draft.outlet_id)
      .maybeSingle();
    if (!outlet || !keyCoversOutlet(apiKey, outlet)) {
      return fail(403, "This API key can't verify payments for that outlet");
    }
  }

  const gatewayCfg = await getOutletGatewayConfig(draft.outlet_id);
  const secret = gatewayCfg.secrets.stripeSecretKey;
  if (!secret) {
    return fail(400, "Stripe secret key is not configured");
  }

  let stripeRes: Response;
  try {
    stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      },
    );
  } catch {
    return fail(502, "Could not verify payment status with Stripe");
  }

  const stripeSession = (await stripeRes.json().catch(() => ({}))) as {
    id?: string;
    payment_status?: string;
    payment_intent?: string;
    error?: { message?: string };
  };

  if (!stripeRes.ok) {
    return fail(
      400,
      stripeSession.error?.message ?? "Failed to verify Stripe session",
    );
  }

  if (stripeSession.payment_status !== "paid") {
    return fail(
      400,
      `Payment is not yet completed (status: ${stripeSession.payment_status ?? "unpaid"})`,
    );
  }

  const finalized = await finalizePaidOrderFromSession({
    sessionReference: sessionId,
    gateway: "stripe",
    paymentId: stripeSession.payment_intent || sessionId,
  });

  if (!finalized.ok) {
    return fail(400, finalized.error);
  }

  return NextResponse.json({ order: finalized.order }, { headers: cors });
}
