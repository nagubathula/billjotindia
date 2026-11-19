import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  finalizePaidBookingDeposit,
  isBookingDepositSession,
} from "@/lib/booking-payments";
import {
  finalizePaidOrderFromSession,
  getOutletGatewayConfig,
  verifyHmacHex,
  type VerifiedOrderDraft,
} from "@/lib/payments";

export async function POST(request: Request) {
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await request.text();

  let event: {
    event?: string;
    payload?: {
      payment?: {
        entity?: {
          id?: string;
          order_id?: string;
          notes?: { outlet_id?: string };
        };
      };
      order?: {
        entity?: {
          id?: string;
          notes?: { outlet_id?: string };
        };
      };
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rzpOrderId =
    event.payload?.payment?.entity?.order_id ??
    event.payload?.order?.entity?.id ??
    "";
  const paymentId = event.payload?.payment?.entity?.id ?? rzpOrderId;

  if (!rzpOrderId) {
    return NextResponse.json({ received: true });
  }

  // Look up outlet_id from payment_sessions so multi-tenant outlets use their own webhook secret
  const admin = createAdminClient();
  const { data: sessionRow } = await admin
    .from("payment_sessions")
    .select("order_data")
    .eq("order_reference", rzpOrderId)
    .maybeSingle();

  const isBookingDeposit = isBookingDepositSession(sessionRow?.order_data);
  const draft = !isBookingDeposit
    ? (sessionRow?.order_data as unknown as VerifiedOrderDraft | undefined)
    : undefined;
  const outletId =
    (isBookingDeposit
      ? (sessionRow?.order_data as { outlet_id: string }).outlet_id
      : draft?.outlet_id) ??
    event.payload?.payment?.entity?.notes?.outlet_id ??
    event.payload?.order?.entity?.notes?.outlet_id ??
    "";

  if (!outletId) {
    return NextResponse.json(
      { error: "Unknown outlet for Razorpay webhook" },
      { status: 400 },
    );
  }

  const gatewayCfg = await getOutletGatewayConfig(outletId);
  const webhookSecret = gatewayCfg.secrets.razorpayWebhookSecret;
  if (!webhookSecret || !verifyHmacHex(rawBody, webhookSecret, signature)) {
    return NextResponse.json(
      { error: "Invalid Razorpay webhook signature" },
      { status: 401 },
    );
  }

  if (event.event === "payment.captured" || event.event === "order.paid") {
    if (isBookingDeposit) {
      await finalizePaidBookingDeposit({
        sessionReference: rzpOrderId,
        gateway: "razorpay",
        paymentId,
      });
    } else {
      await finalizePaidOrderFromSession({
        sessionReference: rzpOrderId,
        gateway: "razorpay",
        paymentId,
        razorpayOrderId: rzpOrderId,
      });
    }
  }

  return NextResponse.json({ received: true });
}
