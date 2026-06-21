import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock, IndianRupee, ListOrdered } from "lucide-react";
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

const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready"];

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

  const activeCount = orders.filter(
    (o) => o.status != null && ACTIVE_STATUSES.includes(o.status),
  ).length;
  const completedCount = orders.filter((o) => o.status === "completed").length;
  const totalValue = orders.reduce(
    (sum, o) => sum + Number(o.total_amount ?? 0),
    0,
  );

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

      {orders.length > 0 && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total orders" value={orders.length} icon={ListOrdered} />
          <StatCard
            label="Active"
            value={activeCount}
            icon={Clock}
            accent="amber"
          />
          <StatCard
            label="Completed"
            value={completedCount}
            icon={CheckCircle2}
            accent="emerald"
          />
          <StatCard
            label="Order value"
            value={`₹${totalValue.toLocaleString("en-IN")}`}
            icon={IndianRupee}
          />
        </section>
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

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "amber" | "emerald";
}) {
  const accentClass =
    accent === "amber"
      ? "bg-amber-500/10 text-amber-600"
      : accent === "emerald"
        ? "bg-emerald-500/10 text-emerald-600"
        : "bg-primary/10 text-primary";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            accentClass,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="truncate text-xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
