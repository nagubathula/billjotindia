import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  IndianRupee,
  ListOrdered,
  MonitorSmartphone,
} from "lucide-react";
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
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ outlet?: string }>;
};

export default async function AdminOrdersPage(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const outlets = await getOutletsForRestaurant(restaurant.id);

  const outletFilter = searchParams.outlet ? String(searchParams.outlet) : null;
  const outletIds = outlets.map((o) => o.id);
  const scopedIds =
    outletFilter && outletIds.includes(outletFilter)
      ? [outletFilter]
      : outletIds;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .in(
      "outlet_id",
      scopedIds.length > 0
        ? scopedIds
        : ["00000000-0000-0000-0000-000000000000"],
    )
    .order("created_at", { ascending: false })
    .limit(250);

  const orders = (data ?? []) as Order[];

  const activeCount = orders.filter(
    (o) => o.status != null && ACTIVE_STATUSES.includes(o.status),
  ).length;
  const completedCount = orders.filter((o) => o.status === "completed").length;
  const totalValue = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description={`Manage, filter, and export orders across ${outlets.length} ${outlets.length === 1 ? "outlet" : "outlets"}.`}
        actions={
          <Link
            href={`/r/${params.slug}/pos`}
            className={buttonVariants({ size: "sm" })}
          >
            <MonitorSmartphone className="mr-1.5 h-3.5 w-3.5" /> New POS Bill
          </Link>
        }
      />

      {error && (
        <p className="text-sm text-destructive">
          Failed to load orders: {error.message}
        </p>
      )}

      {orders.length > 0 && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Total orders"
            value={orders.length}
            icon={ListOrdered}
          />
          <StatCard
            label="Active in queue"
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
            label="Net order value"
            value={`₹${Math.round(totalValue).toLocaleString("en-IN")}`}
            icon={IndianRupee}
          />
        </section>
      )}

      {orders.length === 0 && !error ? (
        <Card>
          <CardContent className="pt-4">
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
      ? "text-amber-600"
      : accent === "emerald"
        ? "text-emerald-600"
        : "text-muted-foreground";
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <Icon className={cn("h-3.5 w-3.5", accentClass)} />
        </div>
        <div className="truncate text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
