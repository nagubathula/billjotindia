import "server-only";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { KitchenStation, Order, OrderItem, Outlet, Product } from "@/lib/types";

export type KitchenOrderItem = OrderItem & {
  kotRound?: number;
  kotAddedAt?: string | null;
};

export type KitchenOrderWithMeta = Order & {
  items: KitchenOrderItem[];
  kotCount: number;
};

const ACTIVE_KDS_STATUSES = ["pending", "confirmed", "preparing", "ready"];

export async function loadKitchenBoardData(restaurantId: string): Promise<{
  outlets: Outlet[];
  stations: KitchenStation[];
  productStationMap: Record<string, string>;
  orders: KitchenOrderWithMeta[];
}> {
  const outlets = await getOutletsForRestaurant(restaurantId);
  const outletIds = outlets.map((o) => o.id);
  if (outletIds.length === 0) {
    return { outlets: [], stations: [], productStationMap: {}, orders: [] };
  }

  const admin = createAdminClient();
  const [
    { data: ordersData },
    { data: stationsData },
    { data: categoriesData },
    { data: productsData },
  ] = await Promise.all([
    admin
      .from("orders")
      .select("*")
      .in("outlet_id", outletIds)
      .in("status", ACTIVE_KDS_STATUSES)
      .order("placed_at", { ascending: true }),
    admin
      .from("kitchen_stations")
      .select("*")
      .in("outlet_id", outletIds)
      .eq("status", "active")
      .order("sort_order"),
    admin
      .from("categories")
      .select("outlet_id, name, station_id")
      .in("outlet_id", outletIds),
    admin
      .from("products")
      .select("id, outlet_id, category, station_id")
      .in("outlet_id", outletIds),
  ]);

  const orders = (ordersData ?? []) as Order[];
  const stations = (stationsData ?? []) as KitchenStation[];
  const stationNameById = new Map(stations.map((s) => [s.id, s.name]));
  const catStationByOutletAndName = new Map<string, string>();
  for (const c of categoriesData ?? []) {
    if (c.station_id) {
      catStationByOutletAndName.set(
        `${c.outlet_id}::${c.name.trim().toLowerCase()}`,
        c.station_id,
      );
    }
  }

  const productStationMap: Record<string, string> = {};
  for (const p of (productsData ?? []) as Pick<
    Product,
    "id" | "outlet_id" | "category" | "station_id"
  >[]) {
    const resolvedId =
      p.station_id ??
      catStationByOutletAndName.get(
        `${p.outlet_id}::${(p.category ?? "").trim().toLowerCase()}`,
      ) ??
      null;
    if (resolvedId && stationNameById.has(resolvedId)) {
      productStationMap[p.id] = stationNameById.get(resolvedId)!;
    }
  }

  if (orders.length === 0) {
    return { outlets, stations, productStationMap, orders: [] };
  }

  const orderIds = orders.map((o) => o.id);
  const [{ data: itemsData }, { data: ticketsData }] = await Promise.all([
    admin
      .from("order_items")
      .select("*")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true }),
    admin
      .from("kot_tickets")
      .select("id, order_id, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true }),
  ]);

  const tickets = ticketsData ?? [];
  const ticketRoundById = new Map<string, { round: number; createdAt: string }>();
  const kotCountByOrder = new Map<string, number>();

  for (const t of tickets) {
    const nextRound = (kotCountByOrder.get(t.order_id) ?? 0) + 1;
    kotCountByOrder.set(t.order_id, nextRound);
    ticketRoundById.set(t.id, { round: nextRound, createdAt: t.created_at });
  }

  const itemRoundByOrderItemId = new Map<
    string,
    { round: number; addedAt: string }
  >();
  if (tickets.length > 0) {
    const { data: ticketItemsData } = await admin
      .from("kot_ticket_items")
      .select("kot_ticket_id, order_item_id, created_at")
      .in(
        "kot_ticket_id",
        tickets.map((t) => t.id),
      );
    for (const ti of ticketItemsData ?? []) {
      const meta = ticketRoundById.get(ti.kot_ticket_id);
      if (!meta) continue;
      const prev = itemRoundByOrderItemId.get(ti.order_item_id);
      if (!prev || meta.round > prev.round) {
        itemRoundByOrderItemId.set(ti.order_item_id, {
          round: meta.round,
          addedAt: meta.createdAt ?? ti.created_at,
        });
      }
    }
  }

  const orderPlacedById = new Map(
    orders.map((o) => [o.id, new Date(o.placed_at).getTime()]),
  );

  const itemsByOrder = new Map<string, KitchenOrderItem[]>();
  for (const rawIt of (itemsData ?? []) as (OrderItem & {
    created_at?: string;
  })[]) {
    const oid = rawIt.order_id as string;
    const ticketMeta = itemRoundByOrderItemId.get(rawIt.id);
    let kotRound = ticketMeta?.round ?? 1;
    const kotAddedAt: string | null = ticketMeta?.addedAt ?? rawIt.created_at ?? null;

    if (!ticketMeta && rawIt.created_at) {
      const placedMs = orderPlacedById.get(oid) ?? 0;
      const itemMs = new Date(rawIt.created_at).getTime();
      if (placedMs > 0 && itemMs - placedMs > 30_000) {
        kotRound = Math.max(2, kotCountByOrder.get(oid) ?? 2);
      }
    }

    const arr = itemsByOrder.get(oid) ?? [];
    arr.push({ ...rawIt, kotRound, kotAddedAt });
    itemsByOrder.set(oid, arr);
  }

  const enriched: KitchenOrderWithMeta[] = orders.map((o) => {
    const items = itemsByOrder.get(o.id) ?? [];
    const maxItemRound = items.reduce(
      (max, it) => Math.max(max, it.kotRound ?? 1),
      1,
    );
    const kotCount = Math.max(kotCountByOrder.get(o.id) ?? 1, maxItemRound);
    return { ...o, items, kotCount };
  });

  return { outlets, stations, productStationMap, orders: enriched };
}
