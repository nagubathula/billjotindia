import { notFound } from "next/navigation";
import { ChefHat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantBySlug } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { KitchenBoard } from "@/components/KitchenBoard";
import type { Order, OrderItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACTIVE = ["pending", "confirmed", "preparing", "ready"];

export default async function KitchenPage({
  params,
}: {
  params: { slug: string };
}) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);
  const scoped = outletIds.length > 0 ? outletIds : [-1];

  const supabase = createClient();
  const { data: ordersData } = await supabase
    .from("orders")
    .select("*")
    .in("outlet_id", scoped)
    .in("status", ACTIVE)
    .order("placed_at", { ascending: true }); // FIFO — oldest first

  const orders = (ordersData ?? []) as Order[];

  let itemsByOrder = new Map<number, OrderItem[]>();
  if (orders.length > 0) {
    const { data: itemsData } = await supabase
      .from("order_items")
      .select("*")
      .in(
        "order_id",
        orders.map((o) => o.id),
      );
    for (const it of (itemsData ?? []) as OrderItem[]) {
      const arr = itemsByOrder.get(it.order_id as number) ?? [];
      arr.push(it);
      itemsByOrder.set(it.order_id as number, arr);
    }
  }

  const withItems = orders.map((o) => ({
    ...o,
    items: itemsByOrder.get(o.id) ?? [],
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kitchen Display"
        description="Live tickets across all outlets. Bump each order as it's cooked and handed off."
      />

      {withItems.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={ChefHat}
              title="No active tickets"
              description="New orders from the POS and storefront appear here automatically."
            />
          </CardContent>
        </Card>
      ) : (
        <KitchenBoard slug={params.slug} orders={withItems} />
      )}
    </div>
  );
}
