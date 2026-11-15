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
  verifyHmacHex,
} from "@/lib/payments";
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

type VerifyRazorpayBody = {
  outlet_id?: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
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
    bucket: `pay-rzp-verify:ip:${ip}`,
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

  let body: VerifyRazorpayBody;
  try {
    body = (await request.json()) as VerifyRazorpayBody;
  } catch {
    return fail(400, "Invalid JSON body");
  }

  const outletId = body?.outlet_id || apiKey?.outletId || "";
  if (
    !outletId ||
    !body?.razorpay_order_id ||
    !body?.razorpay_payment_id ||
    !body?.razorpay_signature
  ) {
    return fail(400, "Missing Razorpay verification fields");
  }

  if (apiKey) {
    const admin = createAdminClient();
    const { data: outlet } = await admin
      .from("outlets")
      .select("id, restaurant_id")
      .eq("id", outletId)
      .maybeSingle();
    if (!outlet || !keyCoversOutlet(apiKey, outlet)) {
      return fail(403, "This API key can't verify payments for that outlet");
    }
  }

  const gatewayCfg = await getOutletGatewayConfig(outletId);
  const secret = gatewayCfg.secrets.razorpayKeySecret;
  if (!secret) {
    return fail(400, "Razorpay secret is not configured");
  }

  const signedPayload = `${body.razorpay_order_id}|${body.razorpay_payment_id}`;
  const valid = verifyHmacHex(
    signedPayload,
    secret,
    body.razorpay_signature,
  );

  if (!valid) {
    return fail(400, "Invalid Razorpay payment signature");
  }

  const finalized = await finalizePaidOrderFromSession({
    sessionReference: body.razorpay_order_id,
    gateway: "razorpay",
    paymentId: body.razorpay_payment_id,
    razorpayOrderId: body.razorpay_order_id,
  });

  if (!finalized.ok) {
    return fail(400, finalized.error);
  }

  return NextResponse.json({ order: finalized.order }, { headers: cors });
}
