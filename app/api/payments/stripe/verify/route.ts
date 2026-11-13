import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  finalizePaidOrderFromSession,
  getOutletGatewayConfig,
  type VerifiedOrderDraft,
} from "@/lib/payments";

export async function POST(request: Request) {
  let body: { session_id?: string };
  try {
    body = (await request.json()) as { session_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = body?.session_id?.trim();
  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing Stripe session_id" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: sessionRow } = await admin
    .from("payment_sessions")
    .select("order_data")
    .eq("order_reference", sessionId)
    .maybeSingle();

  if (!sessionRow?.order_data) {
    return NextResponse.json(
      { error: "Stripe checkout session not found" },
      { status: 404 },
    );
  }

  const draft = sessionRow.order_data as unknown as VerifiedOrderDraft;
  const gatewayCfg = await getOutletGatewayConfig(draft.outlet_id);
  const secret = gatewayCfg.secrets.stripeSecretKey;
  if (!secret) {
    return NextResponse.json(
      { error: "Stripe secret key is not configured" },
      { status: 400 },
    );
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
    return NextResponse.json(
      { error: "Could not verify payment status with Stripe" },
      { status: 502 },
    );
  }

  const stripeSession = (await stripeRes.json().catch(() => ({}))) as {
    id?: string;
    payment_status?: string;
    payment_intent?: string;
    error?: { message?: string };
  };

  if (!stripeRes.ok) {
    return NextResponse.json(
      {
        error:
          stripeSession.error?.message ?? "Failed to verify Stripe session",
      },
      { status: 400 },
    );
  }

  if (stripeSession.payment_status !== "paid") {
    return NextResponse.json(
      {
        error: `Payment is not yet completed (status: ${stripeSession.payment_status ?? "unpaid"})`,
      },
      { status: 400 },
    );
  }

  const finalized = await finalizePaidOrderFromSession({
    sessionReference: sessionId,
    gateway: "stripe",
    paymentId: stripeSession.payment_intent || sessionId,
  });

  if (!finalized.ok) {
    return NextResponse.json({ error: finalized.error }, { status: 400 });
  }

  return NextResponse.json({ order: finalized.order });
}
