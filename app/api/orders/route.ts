import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { OrderSource } from "@/lib/types";

type OrderItemInput = {
  product_config: Record<string, unknown>;
  quantity: number;
  unit_price: number;
  total_price: number;
};

type OrderBody = {
  customer_name: string;
  customer_email: string;
  order_type: string;
  subtotal: number;
  takeaway_charges: number;
  total_amount: number;
  items: OrderItemInput[];
  // Optional — present for kiosk/pos clients and aggregator webhooks.
  source?: OrderSource;
  outlet_id?: number;
  external_order_id?: string;
  external_payload?: Record<string, unknown>;
};

const FALLBACK_OUTLET_ID = Number(
  process.env.NEXT_PUBLIC_DEFAULT_OUTLET_ID ?? "1",
);

export async function POST(request: Request) {
  const body = (await request.json()) as OrderBody;

  if (!body.customer_name || !body.customer_email || !body.items?.length) {
    return NextResponse.json(
      { error: "Missing customer or items" },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const outletId = body.outlet_id ?? FALLBACK_OUTLET_ID;
  const source: OrderSource = body.source ?? "web";

  // Idempotency for aggregator webhooks: if this (outlet, source, external_order_id)
  // already landed, return the existing order rather than inserting a duplicate.
  if (body.external_order_id) {
    const { data: existing } = await supabase
      .from("orders")
      .select("*")
      .eq("outlet_id", outletId)
      .eq("source", source)
      .eq("external_order_id", body.external_order_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ order: existing, deduped: true });
    }
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      outlet_id: outletId,
      source,
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      order_type: body.order_type,
      subtotal: body.subtotal,
      takeaway_charges: body.takeaway_charges,
      total_amount: body.total_amount,
      status: "pending",
      unique_order_id: `BJ-${Date.now()}`,
      external_order_id: body.external_order_id ?? null,
      external_payload: body.external_payload ?? null,
    })
    .select()
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: orderErr?.message ?? "Failed to create order" },
      { status: 500 },
    );
  }

  const { error: itemsErr } = await supabase.from("order_items").insert(
    body.items.map((it) => ({
      order_id: order.id,
      product_config: it.product_config,
      quantity: it.quantity,
      unit_price: it.unit_price,
      total_price: it.total_price,
    })),
  );

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  return NextResponse.json({ order });
}
