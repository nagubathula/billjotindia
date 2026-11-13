import { NextResponse } from "next/server";
import {
  finalizePaidOrderFromSession,
  getOutletGatewayConfig,
  verifyHmacHex,
} from "@/lib/payments";

type VerifyRazorpayBody = {
  outlet_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export async function POST(request: Request) {
  let body: VerifyRazorpayBody;
  try {
    body = (await request.json()) as VerifyRazorpayBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body?.outlet_id ||
    !body?.razorpay_order_id ||
    !body?.razorpay_payment_id ||
    !body?.razorpay_signature
  ) {
    return NextResponse.json(
      { error: "Missing Razorpay verification fields" },
      { status: 400 },
    );
  }

  const gatewayCfg = await getOutletGatewayConfig(body.outlet_id);
  const secret = gatewayCfg.secrets.razorpayKeySecret;
  if (!secret) {
    return NextResponse.json(
      { error: "Razorpay secret is not configured" },
      { status: 400 },
    );
  }

  const signedPayload = `${body.razorpay_order_id}|${body.razorpay_payment_id}`;
  const valid = verifyHmacHex(
    signedPayload,
    secret,
    body.razorpay_signature,
  );

  if (!valid) {
    return NextResponse.json(
      { error: "Invalid Razorpay payment signature" },
      { status: 400 },
    );
  }

  const finalized = await finalizePaidOrderFromSession({
    sessionReference: body.razorpay_order_id,
    gateway: "razorpay",
    paymentId: body.razorpay_payment_id,
    razorpayOrderId: body.razorpay_order_id,
  });

  if (!finalized.ok) {
    return NextResponse.json({ error: finalized.error }, { status: 400 });
  }

  return NextResponse.json({ order: finalized.order });
}
