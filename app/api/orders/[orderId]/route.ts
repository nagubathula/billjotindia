import { NextResponse } from "next/server";
import { apiCorsHeaders } from "@/lib/api-cors";
import { authenticateApiKey, keyCoversOutlet } from "@/lib/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";

// GET /api/orders/{orderId} — an order's live status, for frontends that hold
// a restaurant API key with the "Place orders" permission (to show customers
// an order-tracking page). Orders of other restaurants, or of outlets the key
// doesn't cover, answer 404 as if they didn't exist.

export const dynamic = "force-dynamic";

function cors(request: Request) {
  return apiCorsHeaders(request.headers.get("origin"), "GET, OPTIONS");
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const headers = cors(request);
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers });

  const check = await authenticateApiKey(request, "orders:write");
  if (!check.ok) return fail(check.status, check.error);

  const { orderId } = await params;
  if (!isUuid(orderId)) return fail(404, "Order not found");

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, unique_order_id, token_number, status, order_type, source, customer_name, subtotal, total_amount, placed_at, updated_at, outlet_id",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return fail(404, "Order not found");

  const { data: outlet } = await supabase
    .from("outlets")
    .select("id, restaurant_id")
    .eq("id", order.outlet_id)
    .maybeSingle();
  if (!outlet || !keyCoversOutlet(check.key, outlet)) {
    return fail(404, "Order not found");
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("quantity, total_price, instructions, product_config")
    .eq("order_id", order.id);

  return NextResponse.json(
    {
      order: {
        ...order,
        subtotal: Number(order.subtotal),
        total_amount: Number(order.total_amount),
        items: (items ?? []).map((it) => {
          const cfg = (it.product_config ?? {}) as {
            product_id?: string;
            name?: string;
            selected_options?: { option_name?: string }[];
          };
          return {
            product_id: cfg.product_id ?? null,
            name: cfg.name ?? "Item",
            quantity: Number(it.quantity),
            total_price: Number(it.total_price),
            options: (cfg.selected_options ?? [])
              .map((o) => o.option_name)
              .filter(Boolean),
            instructions: it.instructions,
          };
        }),
      },
    },
    { headers: { ...headers, "Cache-Control": "no-store" } },
  );
}
