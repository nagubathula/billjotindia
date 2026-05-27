import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, IndianRupee, Receipt, ShoppingBag, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantBySlug } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Order, OrderItem, ProductConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

type Range = "today" | "yesterday" | "7d" | "30d";

const RANGE_LABEL: Record<Range, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

function rangeBounds(r: Range): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  switch (r) {
    case "today":
      return { start, end };
    case "yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      return { start, end };
    case "7d":
      start.setDate(start.getDate() - 6);
      return { start, end };
    case "30d":
      start.setDate(start.getDate() - 29);
      return { start, end };
  }
}

type Props = {
  params: { slug: string };
  searchParams: { range?: string };
};

export default async function ReportsPage({ params, searchParams }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const range = ((searchParams.range as Range) ?? "today") as Range;
  const validRange: Range = ["today", "yesterday", "7d", "30d"].includes(range)
    ? range
    : "today";
  const { start, end } = rangeBounds(validRange);

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);

  const supabase = createClient();
  const { data: ordersData } = await supabase
    .from("orders")
    .select("*")
    .in("outlet_id", outletIds.length > 0 ? outletIds : [-1])
    .gte("placed_at", start.toISOString())
    .lte("placed_at", end.toISOString())
    .neq("status", "cancelled")
    .order("placed_at", { ascending: false });

  const orders = (ordersData ?? []) as Order[];

  let items: OrderItem[] = [];
  if (orders.length > 0) {
    const ids = orders.map((o) => o.id);
    const { data: itemsData } = await supabase
      .from("order_items")
      .select("*")
      .in("order_id", ids);
    items = (itemsData ?? []) as OrderItem[];
  }

  // Aggregate
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount), 0);
  const aov = totalOrders ? totalRevenue / totalOrders : 0;
  const totalGst =
    orders.reduce(
      (s, o) =>
        s +
        Number(o.cgst_amount ?? 0) +
        Number(o.sgst_amount ?? 0) +
        Number(o.igst_amount ?? 0),
      0,
    ) || 0;

  // Top products by quantity
  const productTotals = new Map<
    string,
    { name: string; qty: number; revenue: number }
  >();
  for (const it of items) {
    const cfg = it.product_config as unknown as ProductConfig | null;
    const key = cfg?.name ?? `#${cfg?.product_id ?? it.id}`;
    const cur = productTotals.get(key) ?? { name: key, qty: 0, revenue: 0 };
    cur.qty += it.quantity;
    cur.revenue += Number(it.total_price);
    productTotals.set(key, cur);
  }
  const topProducts = Array.from(productTotals.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  // Source split
  const sourceTotals = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    const cur = sourceTotals.get(o.source) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(o.total_amount);
    sourceTotals.set(o.source, cur);
  }
  const sources = Array.from(sourceTotals.entries()).sort(
    (a, b) => b[1].revenue - a[1].revenue,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={`${RANGE_LABEL[validRange]}. Cancelled orders excluded.`}
      />

      {/* Range tabs */}
      <nav className="flex flex-wrap gap-1">
        {(["today", "yesterday", "7d", "30d"] as const).map((r) => (
          <Link
            key={r}
            href={`/r/${params.slug}/admin/reports?range=${r}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition",
              r === validRange
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
          >
            {RANGE_LABEL[r]}
          </Link>
        ))}
      </nav>

      {/* Stat cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={ShoppingBag}
          label="Orders"
          value={totalOrders.toString()}
        />
        <Stat
          icon={IndianRupee}
          label="Revenue"
          value={`₹${totalRevenue.toFixed(0)}`}
        />
        <Stat
          icon={TrendingUp}
          label="Avg order"
          value={totalOrders ? `₹${aov.toFixed(0)}` : "—"}
        />
        <Stat
          icon={Receipt}
          label="GST collected"
          value={`₹${totalGst.toFixed(0)}`}
        />
      </section>

      {/* Top products + source split */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Top items
            </CardTitle>
            <CardDescription>By quantity sold.</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="No sales in this range"
                description="Pick a different time range, or wait for orders to come in."
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-1.5 font-normal">Item</th>
                    <th className="py-1.5 text-right font-normal">Qty</th>
                    <th className="py-1.5 text-right font-normal">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={p.name + i} className="border-b last:border-0">
                      <td className="py-1.5 font-medium">{p.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.qty}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        ₹{p.revenue.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By source</CardTitle>
            <CardDescription>Where the orders came from.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {sources.length === 0 ? (
              <p className="text-muted-foreground">—</p>
            ) : (
              sources.map(([src, val]) => (
                <div key={src} className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {src}
                  </Badge>
                  <span className="text-muted-foreground tabular-nums">
                    {val.count} · ₹{val.revenue.toFixed(0)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
