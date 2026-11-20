import type { createAdminClient } from "@/lib/supabase/admin";

type AdminDb = ReturnType<typeof createAdminClient>;

export type RoutableInsertedItem = {
  id: string;
  quantity: number;
  instructions: string | null;
  productId?: string | null;
  name?: string;
};

export type RoutedStationGroup = {
  stationId: string | null;
  stationName: string;
  printerId: string | null;
  items: RoutableInsertedItem[];
};

export function resolveEffectiveStationId(
  product:
    | { station_id?: string | null; category?: string | null; is_kot_required?: boolean | null }
    | undefined,
  categoryStationByName: Map<string, string | null>,
): string | null {
  if (!product) return null;
  if (product.station_id) return product.station_id;
  if (product.category) {
    return (
      categoryStationByName.get(product.category.trim().toLowerCase()) ?? null
    );
  }
  return null;
}

export function groupOrderItemsByStation(params: {
  items: RoutableInsertedItem[];
  productsById: Map<
    string,
    { id: string; category: string | null; station_id: string | null; is_kot_required: boolean }
  >;
  categoryStationByName: Map<string, string | null>;
  stationsById: Map<string, { id: string; name: string; printer_id: string | null }>;
}): RoutedStationGroup[] {
  const groups = new Map<string, RoutedStationGroup>();

  for (const item of params.items) {
    const prod = item.productId ? params.productsById.get(item.productId) : undefined;
    if (prod && prod.is_kot_required === false) {
      continue;
    }

    const stationId = resolveEffectiveStationId(prod, params.categoryStationByName);
    const station = stationId ? params.stationsById.get(stationId) : undefined;
    const key = station ? station.id : "__general__";

    const cur = groups.get(key) ?? {
      stationId: station ? station.id : null,
      stationName: station ? station.name : "Main Kitchen",
      printerId: station?.printer_id ?? null,
      items: [],
    };
    cur.items.push(item);
    groups.set(key, cur);
  }

  return Array.from(groups.values());
}

export type CreatedKotTicketSummary = {
  ticketId: string;
  stationId: string | null;
  stationName: string;
  printerId: string | null;
  itemCount: number;
};

export async function insertRoutedKotTickets(
  db: AdminDb,
  params: {
    outletId: string;
    orderId: string;
    tokenNumber: number | null;
    notes: string | null;
    insertedItems: Array<{
      id: string;
      quantity: number;
      instructions: string | null;
      product_config?: unknown;
    }>;
  },
): Promise<CreatedKotTicketSummary[]> {
  if (params.insertedItems.length === 0) return [];

  const routable: RoutableInsertedItem[] = params.insertedItems.map((oi) => {
    const cfg =
      oi.product_config && typeof oi.product_config === "object"
        ? (oi.product_config as { product_id?: unknown; name?: unknown })
        : {};
    return {
      id: oi.id,
      quantity: oi.quantity,
      instructions: oi.instructions,
      productId: typeof cfg.product_id === "string" ? cfg.product_id : null,
      name: typeof cfg.name === "string" ? cfg.name : "Item",
    };
  });

  const productIds = [
    ...new Set(routable.map((r) => r.productId).filter((v): v is string => Boolean(v))),
  ];

  const [productsRes, categoriesRes, stationsRes] = await Promise.all([
    productIds.length > 0
      ? db
          .from("products")
          .select("id, category, station_id, is_kot_required")
          .eq("outlet_id", params.outletId)
          .in("id", productIds)
      : Promise.resolve({ data: [] }),
    db
      .from("categories")
      .select("name, station_id")
      .eq("outlet_id", params.outletId),
    db
      .from("kitchen_stations")
      .select("id, name, printer_id, sort_order")
      .eq("outlet_id", params.outletId)
      .eq("status", "active")
      .order("sort_order", { ascending: true }),
  ]);

  const productsById = new Map<
    string,
    { id: string; category: string | null; station_id: string | null; is_kot_required: boolean }
  >();
  for (const p of productsRes.data ?? []) {
    productsById.set(p.id, {
      id: p.id,
      category: p.category,
      station_id: p.station_id,
      is_kot_required: p.is_kot_required !== false,
    });
  }

  const categoryStationByName = new Map<string, string | null>();
  for (const c of categoriesRes.data ?? []) {
    categoryStationByName.set(c.name.trim().toLowerCase(), c.station_id ?? null);
  }

  const stationsById = new Map<
    string,
    { id: string; name: string; printer_id: string | null }
  >();
  for (const s of stationsRes.data ?? []) {
    stationsById.set(s.id, {
      id: s.id,
      name: s.name,
      printer_id: s.printer_id,
    });
  }

  const groups = groupOrderItemsByStation({
    items: routable,
    productsById,
    categoryStationByName,
    stationsById,
  });

  const nowIso = new Date().toISOString();
  const created: CreatedKotTicketSummary[] = [];

  for (const g of groups) {
    const { data: ticket } = await db
      .from("kot_tickets")
      .insert({
        outlet_id: params.outletId,
        order_id: params.orderId,
        station_id: g.stationId,
        printer_id: g.printerId,
        ticket_number: params.tokenNumber,
        status: "printed",
        notes: params.notes,
        printed_at: nowIso,
      })
      .select("id")
      .maybeSingle();

    if (ticket) {
      await db.from("kot_ticket_items").insert(
        g.items.map((oi) => ({
          kot_ticket_id: ticket.id,
          order_item_id: oi.id,
          quantity: oi.quantity,
          notes: oi.instructions,
        })),
      );
      created.push({
        ticketId: ticket.id,
        stationId: g.stationId,
        stationName: g.stationName,
        printerId: g.printerId,
        itemCount: g.items.reduce((s, it) => s + Number(it.quantity || 0), 0),
      });
    }
  }

  return created;
}
