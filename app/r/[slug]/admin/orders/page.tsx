import { notFound } from "next/navigation";
import Link from "next/link";
import { ListOrdered } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantBySlug } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OrdersTable } from "./OrdersTable";
import type { Order, Outlet } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = {
  params: { slug: string };
  searchParams: { outlet?: string };
};

export default async function AdminOrdersPage({ params, searchParams }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const outlets = await getOutletsForRestaurant(restaurant.id);

  const outletFilter = searchParams.outlet ? Number(searchParams.outlet) : null;
  const outletIds = outlets.map((o) => o.id);
  const scopedIds =
    outletFilter && outletIds.includes(outletFilter)
      ? [outletFilter]
      : outletIds;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .in("outlet_id", scopedIds.length > 0 ? scopedIds : [-1])
    .order("created_at", { ascending: false })
    .limit(100);

  const orders = (data ?? []) as Order[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description={`${orders.length} ${orders.length === 1 ? "order" : "orders"} across ${outlets.length} ${outlets.length === 1 ? "outlet" : "outlets"}.`}
      />

      {error && (
        <p className="text-sm text-destructive">
          Failed to load orders: {error.message}
        </p>
      )}

      {orders.length === 0 && !error ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={ListOrdered}
              title="No orders yet"
              description="Orders from the POS or the customer storefront will show up here."
              action={
                <Link
                  href={`/r/${params.slug}/pos`}
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  Open POS
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <OrdersTable
          orders={orders}
          outlets={outlets as Outlet[]}
          restaurantSlug={params.slug}
          outletFilter={outletFilter}
        />
      )}
    </div>
  );
}
