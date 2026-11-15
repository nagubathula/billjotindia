import { NextResponse } from "next/server";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import { authenticateApiKey } from "@/lib/api-keys";
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import {
  presentedCustomerToken,
  verifyCustomerToken,
} from "@/lib/storefront-customers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  const headers = await preflightCorsHeaders(request, "GET, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(origin, "GET, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `customer-me:ip:${ip}`,
    limit: 120,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
    );
  }

  const auth = await authenticateApiKey(request, "orders:write");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
    );
  }
  cors = {
    ...apiCorsHeaders(origin, "GET, OPTIONS", auth.key.allowedOrigins, request.url),
    ...rateLimitHeaders(ipLimit),
  };
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: cors });

  const verified = verifyCustomerToken(
    presentedCustomerToken(request),
    auth.key.restaurantId,
  );
  if (!verified) {
    return fail(401, "Invalid or expired customer session token.");
  }

  const supabase = createAdminClient();
  const { data: customer } = await supabase
    .from("storefront_customers")
    .select("id, email, name, phone, created_at")
    .eq("id", verified.customerId)
    .eq("restaurant_id", auth.key.restaurantId)
    .maybeSingle();

  if (!customer) {
    return fail(401, "Customer account not found.");
  }

  // Scope order history to outlets covered by this API key
  let outletIds: string[] = [];
  if (auth.key.outletId) {
    outletIds = [auth.key.outletId];
  } else {
    const { data: outlets } = await supabase
      .from("outlets")
      .select("id")
      .eq("restaurant_id", auth.key.restaurantId);
    outletIds = (outlets ?? []).map((o) => o.id);
  }

  if (outletIds.length === 0) {
    return NextResponse.json(
      { customer, orders: [] },
      { headers: { ...cors, "Cache-Control": "no-store" } },
    );
  }

  // Fetch orders linked by customer_account_id OR placed with the customer's email
  const [byIdRes, byEmailRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, unique_order_id, token_number, status, order_type, source, customer_name, subtotal, total_amount, payment_status, payment_provider, placed_at, updated_at, outlet_id",
      )
      .in("outlet_id", outletIds)
      .eq("customer_account_id", customer.id)
      .order("placed_at", { ascending: false })
      .limit(30),
    supabase
      .from("orders")
      .select(
        "id, unique_order_id, token_number, status, order_type, source, customer_name, subtotal, total_amount, payment_status, payment_provider, placed_at, updated_at, outlet_id",
      )
      .in("outlet_id", outletIds)
      .ilike("customer_email", customer.email)
      .order("placed_at", { ascending: false })
      .limit(30),
  ]);

  const mergedMap = new Map<string, NonNullable<typeof byIdRes.data>[number]>();
  for (const row of [...(byIdRes.data ?? []), ...(byEmailRes.data ?? [])]) {
    if (!mergedMap.has(row.id)) mergedMap.set(row.id, row);
  }
  const sortedOrders = [...mergedMap.values()]
    .sort(
      (a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime(),
    )
    .slice(0, 30);

  const orderIds = sortedOrders.map((o) => o.id);
  const itemsByOrder = new Map<
    string,
    { name: string; quantity: number; total_price: number }[]
  >();
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, quantity, total_price, product_config")
      .in("order_id", orderIds);
    for (const it of items ?? []) {
      if (!it.order_id) continue;
      const cfg = (it.product_config ?? {}) as { name?: string };
      const list = itemsByOrder.get(it.order_id) ?? [];
      list.push({
        name: cfg.name ?? "Item",
        quantity: Number(it.quantity),
        total_price: Number(it.total_price),
      });
      itemsByOrder.set(it.order_id, list);
    }
  }

  return NextResponse.json(
    {
      customer,
      orders: sortedOrders.map((o) => ({
        ...o,
        subtotal: Number(o.subtotal ?? 0),
        total_amount: Number(o.total_amount ?? 0),
        items: itemsByOrder.get(o.id) ?? [],
      })),
    },
    { headers: { ...cors, "Cache-Control": "no-store" } },
  );
}
