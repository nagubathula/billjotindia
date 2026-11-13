import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantBySlug } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { PageHeader } from "@/components/PageHeader";
import { KitchenBoard } from "@/components/KitchenBoard";
import type { KitchenStation, Order, OrderItem, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACTIVE = ["pending", "confirmed", "preparing", "ready"];

export default async function KitchenPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);
  const scoped =
    outletIds.length > 0
      ? outletIds
      : ["00000000-0000-0000-0000-000000000000"];

  const supabase = await createClient();
  const [{ data: ordersData }, { data: stationsData }, { data: productsData }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .in("outlet_id", scoped)
        .in("status", ACTIVE)
        .order("placed_at", { ascending: true }), // FIFO — oldest first
      supabase
        .from("kitchen_stations")
        .select("*")
        .in("outlet_id", scoped)
        .eq("status", "active")
        .order("sort_order"),
      supabase
        .from("products")
        .select("id, station_id")
        .in("outlet_id", scoped),
    ]);

  const orders = (ordersData ?? []) as Order[];
  const stations = (stationsData ?? []) as KitchenStation[];
  const stationNameById = new Map(stations.map((s) => [s.id, s.name]));

  const productStationMap: Record<string, string> = {};
  for (const p of (productsData ?? []) as Pick<Product, "id" | "station_id">[]) {
    if (p.station_id && stationNameById.has(p.station_id)) {
      productStationMap[p.id] = stationNameById.get(p.station_id)!;
    }
  }

  const itemsByOrder = new Map<string, OrderItem[]>();
  if (orders.length > 0) {
    const { data: itemsData } = await supabase
      .from("order_items")
      .select("*")
      .in(
        "order_id",
        orders.map((o) => o.id),
      );
    for (const it of (itemsData ?? []) as OrderItem[]) {
      const arr = itemsByOrder.get(it.order_id as string) ?? [];
      arr.push(it);
      itemsByOrder.set(it.order_id as string, arr);
    }
  }

  const withItems = orders.map((o) => ({
    ...o,
    items: itemsByOrder.get(o.id) ?? [],
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kitchen (KDS)"
        description="Live kitchen tickets grouped by stage."
      />

      <KitchenBoard
        slug={params.slug}
        initialOrders={withItems}
        outlets={outlets}
        stations={stations}
        productStationMap={productStationMap}
      />
    </div>
  );
}
