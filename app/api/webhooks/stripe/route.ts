import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  finalizePaidOrderFromSession,
  getOutletGatewayConfig,
  verifyStripeWebhookSignature,
  type VerifiedOrderDraft,
} from "@/lib/payments";

export async function POST(request: Request) {
  const sigHeader = request.headers.get("stripe-signature") ?? "";
  const rawBody = await request.text();

  let event: {
    type?: string;
    data?: {
      object?: {
        id?: string;
        payment_status?: string;
        payment_intent?: string;
        metadata?: { outlet_id?: string };
      };
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionObj = event.data?.object;
  const sessionId = sessionObj?.id ?? "";
  if (!sessionId) {
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  const { data: sessionRow } = await admin
    .from("payment_sessions")
    .select("order_data")
    .eq("order_reference", sessionId)
    .maybeSingle();

  const draft = sessionRow?.order_data as unknown as
    | VerifiedOrderDraft
    | undefined;
  const outletId = draft?.outlet_id ?? sessionObj?.metadata?.outlet_id ?? "";

  if (!outletId) {
    return NextResponse.json(
      { error: "Unknown outlet for Stripe webhook" },
      { status: 400 },
    );
  }

  const gatewayCfg = await getOutletGatewayConfig(outletId);
  const webhookSecret = gatewayCfg.secrets.stripeWebhookSecret;
  if (
    !webhookSecret ||
    !verifyStripeWebhookSignature(rawBody, sigHeader, webhookSecret)
  ) {
    return NextResponse.json(
      { error: "Invalid Stripe webhook signature" },
      { status: 401 },
    );
  }

  if (
    (event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded") &&
    sessionObj?.payment_status === "paid"
  ) {
    await finalizePaidOrderFromSession({
      sessionReference: sessionId,
      gateway: "stripe",
      paymentId: sessionObj.payment_intent || sessionId,
    });
  }

  return NextResponse.json({ received: true });
}
