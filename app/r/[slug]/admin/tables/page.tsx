import { notFound } from "next/navigation";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTimeZone, startOfDay } from "@/lib/time";
import type { OrderItem, ProductConfig } from "@/lib/types";
import {
  TableFloorBoard,
  type ActiveTableOrder,
  type RawPosTab,
} from "./TableFloorBoard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function AdminTablesPage(props: Props) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/tables`,
  });

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);
  const scoped =
    outletIds.length > 0
      ? outletIds
      : ["00000000-0000-0000-0000-000000000000"];

  const timeZone = resolveTimeZone(outlets[0]?.timezone);
  const todayStart = startOfDay(new Date(), timeZone);

  const admin = createAdminClient();
  const [{ data: posTabsData }, { data: openOrdersData }, { data: todayDineInData }] =
    await Promise.all([
      admin
        .from("pos_tabs")
        .select("id, outlet_id, name, lines, updated_at")
        .in("outlet_id", scoped)
        .order("name", { ascending: true }),
      admin
        .from("orders")
        .select(
          "id, outlet_id, unique_order_id, token_number, status, customer_name, instructions, total_amount, placed_at, order_type",
        )
        .in("outlet_id", scoped)
        .eq("order_type", "dine-in")
        .in("status", ["pending", "confirmed", "preparing", "ready"])
        .order("placed_at", { ascending: false }),
      admin
        .from("orders")
        .select("id, total_amount")
        .in("outlet_id", scoped)
        .eq("order_type", "dine-in")
        .neq("status", "cancelled")
        .gte("placed_at", todayStart.toISOString()),
    ]);

  const openOrderIds = (openOrdersData ?? []).map((o) => o.id);
  const itemSummaryByOrder = new Map<string, string[]>();

  if (openOrderIds.length > 0) {
    const { data: orderItems } = await admin
      .from("order_items")
      .select("order_id, quantity, product_config")
      .in("order_id", openOrderIds);

    for (const it of (orderItems ?? []) as Pick<
      OrderItem,
      "order_id" | "quantity" | "product_config"
    >[]) {
      if (!it.order_id) continue;
      const cfg = it.product_config as unknown as ProductConfig | null;
      const label = `${it.quantity}× ${cfg?.name ?? "Item"}`;
      const list = itemSummaryByOrder.get(it.order_id) ?? [];
      list.push(label);
      itemSummaryByOrder.set(it.order_id, list);
    }
  }

  const activeOrders: ActiveTableOrder[] = (openOrdersData ?? []).map((o) => ({
    id: o.id,
    outlet_id: o.outlet_id,
    unique_order_id: o.unique_order_id,
    token_number: o.token_number,
    status: o.status,
    customer_name: o.customer_name,
    instructions: o.instructions,
    total_amount: Number(o.total_amount),
    placed_at: o.placed_at,
    item_summary: itemSummaryByOrder.get(o.id) ?? [],
  }));

  const tabs: RawPosTab[] = (posTabsData ?? []).map((t) => ({
    id: t.id,
    outlet_id: t.outlet_id,
    name: t.name,
    lines: Array.isArray(t.lines) ? (t.lines as RawPosTab["lines"]) : [],
    updated_at: t.updated_at,
  }));

  const todayDineInCount = (todayDineInData ?? []).length;
  const todayDineInRevenue = (todayDineInData ?? []).reduce(
    (s, o) => s + Number(o.total_amount),
    0,
  );

  return (
    <TableFloorBoard
      slug={params.slug}
      outlets={outlets.map((o) => ({ id: o.id, name: o.name, city: o.city }))}
      tabs={tabs}
      activeOrders={activeOrders}
      todayDineInCount={todayDineInCount}
      todayDineInRevenue={todayDineInRevenue}
    />
  );
}
