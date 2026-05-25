import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
};

export async function POST(request: Request) {
  const body = (await request.json()) as OrderBody;

  if (!body.customer_name || !body.customer_email || !body.items?.length) {
    return NextResponse.json(
      { error: "Missing customer or items" },
      { status: 400 },
    );
  }

  const supabase = createClient();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      order_type: body.order_type,
      subtotal: body.subtotal,
      takeaway_charges: body.takeaway_charges,
      total_amount: body.total_amount,
      status: "pending",
      unique_order_id: `BJ-${Date.now()}`,
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
