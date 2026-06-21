import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BarChart3,
  IndianRupee,
  Receipt,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Utensils,
  Layers,
  Clock,
} from "lucide-react";
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

const PREV_LABEL: Record<Range, string> = {
  today: "vs yesterday",
  yesterday: "vs prev day",
  "7d": "vs prev 7 days",
  "30d": "vs prev 30 days",
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

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
function hourLabel(h: number) {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}
function gstFromItems(items: OrderItem[]) {
  let gst = 0;
  for (const it of items) {
    const cfg = it.product_config as unknown as ProductConfig & {
      gst_rate?: number;
    };
    const rate = Number(cfg?.gst_rate ?? 5) / 100;
    const line = Number(it.total_price);
    gst += line - line / (1 + rate);
  }
  return gst;
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
  const scoped = outletIds.length > 0 ? outletIds : [-1];

  const supabase = createClient();
  const { data: ordersData } = await supabase
    .from("orders")
    .select("*")
    .in("outlet_id", scoped)
    .gte("placed_at", start.toISOString())
    .lte("placed_at", end.toISOString())
    .neq("status", "cancelled")
    .order("placed_at", { ascending: true });

  const orders = (ordersData ?? []) as Order[];

  // Previous comparable period (for deltas).
  const periodMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - periodMs);
  const { data: prevData } = await supabase
    .from("orders")
    .select("total_amount")
    .in("outlet_id", scoped)
    .gte("placed_at", prevStart.toISOString())
    .lte("placed_at", prevEnd.toISOString())
    .neq("status", "cancelled");
  const prevOrders = prevData?.length ?? 0;
  const prevRevenue = (prevData ?? []).reduce(
    (s, o) => s + Number(o.total_amount),
    0,
  );

  let items: OrderItem[] = [];
  if (orders.length > 0) {
    const ids = orders.map((o) => o.id);
    const { data: itemsData } = await supabase
      .from("order_items")
      .select("*")
      .in("order_id", ids);
    items = (itemsData ?? []) as OrderItem[];
  }

  // ---- Aggregates ----
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount), 0);
  const aov = totalOrders ? totalRevenue / totalOrders : 0;
  const prevAov = prevOrders ? prevRevenue / prevOrders : 0;
  // GST derived from line items so it's correct even when order rows omit it.
  const totalGst = gstFromItems(items);

  const delta = (cur: number, prev: number): number | null =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

  // ---- Time series (hourly for a single day, daily otherwise) ----
  const isHourly = validRange === "today" || validRange === "yesterday";
  const series: { label: string; value: number }[] = [];
  if (isHourly) {
    const map = new Map<number, number>();
    for (let h = 7; h <= 23; h++) map.set(h, 0);
    for (const o of orders) {
      const h = new Date(o.placed_at as string).getHours();
      if (!map.has(h)) map.set(h, 0);
      map.set(h, (map.get(h) ?? 0) + Number(o.total_amount));
    }
    [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([h, v]) => series.push({ label: hourLabel(h), value: v }));
  } else {
    const days = validRange === "7d" ? 7 : 30;
    const map = new Map<string, { label: string; value: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      map.set(d.toLocaleDateString("en-CA"), {
        label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        value: 0,
      });
    }
    for (const o of orders) {
      const key = new Date(o.placed_at as string).toLocaleDateString("en-CA");
      const b = map.get(key);
      if (b) b.value += Number(o.total_amount);
    }
    series.push(...map.values());
  }
  const seriesMax = Math.max(...series.map((s) => s.value), 1);
  const peak = series.reduce(
    (best, s) => (s.value > best.value ? s : best),
    series[0] ?? { label: "—", value: 0 },
  );
  const labelEvery = Math.ceil(series.length / 8);

  // ---- Top products ----
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
    .slice(0, 8);
  const topMaxQty = Math.max(...topProducts.map((p) => p.qty), 1);

  // ---- Source split ----
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

  // ---- Order-type split ----
  const typeTotals = new Map<string, number>();
  for (const o of orders) {
    const t = o.order_type ?? "other";
    typeTotals.set(t, (typeTotals.get(t) ?? 0) + 1);
  }
  const types = Array.from(typeTotals.entries()).sort((a, b) => b[1] - a[1]);

  // ---- Sales by category (map product_id -> category via products) ----
  const prodCat = new Map<number, string>();
  if (items.length > 0) {
    const { data: prods } = await supabase
      .from("products")
      .select("id, category")
      .in("outlet_id", scoped);
    for (const p of prods ?? []) prodCat.set(p.id, p.category ?? "Other");
  }
  const catTotals = new Map<string, number>();
  for (const it of items) {
    const cfg = it.product_config as unknown as ProductConfig | null;
    const cat =
      (cfg?.product_id != null && prodCat.get(cfg.product_id)) || "Other";
    catTotals.set(cat, (catTotals.get(cat) ?? 0) + Number(it.total_price));
  }
  const categories = Array.from(catTotals.entries()).sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(...categories.map((c) => c[1]), 1);

  // ---- Busiest hours (orders by hour-of-day across the range) ----
  const hourCounts = new Array(24).fill(0);
  for (const o of orders) hourCounts[new Date(o.placed_at as string).getHours()]++;
  const bizHours: { label: string; count: number }[] = [];
  for (let h = 7; h <= 23; h++)
    bizHours.push({ label: hourLabel(h), count: hourCounts[h] });
  const hourMax = Math.max(...bizHours.map((b) => b.count), 1);

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
          deltaPct={delta(totalOrders, prevOrders)}
          deltaLabel={PREV_LABEL[validRange]}
        />
        <Stat
          icon={IndianRupee}
          label="Revenue"
          value={inr(totalRevenue)}
          deltaPct={delta(totalRevenue, prevRevenue)}
          deltaLabel={PREV_LABEL[validRange]}
        />
        <Stat
          icon={TrendingUp}
          label="Avg order"
          value={totalOrders ? inr(aov) : "—"}
          deltaPct={delta(aov, prevAov)}
          deltaLabel={PREV_LABEL[validRange]}
        />
        <Stat icon={Receipt} label="GST collected" value={inr(totalGst)} />
      </section>

      {/* Revenue trend */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Revenue trend
            </CardTitle>
            <CardDescription>
              {isHourly ? "By hour" : "By day"} · {RANGE_LABEL[validRange]}
            </CardDescription>
          </div>
          {totalOrders > 0 && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Peak</div>
              <div className="text-sm font-semibold">
                {peak.label} · {inr(peak.value)}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {totalOrders === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No sales in this range"
              description="Pick a different time range, or wait for orders to come in."
            />
          ) : (
            <div>
              <div className="flex h-44 items-end gap-1">
                {series.map((s, i) => (
                  <div
                    key={i}
                    className="group relative flex h-full flex-1 items-end"
                    title={`${s.label}: ${inr(s.value)}`}
                  >
                    <div
                      className="w-full rounded-t bg-primary/85 transition-all group-hover:bg-primary"
                      style={{
                        height: `${Math.max((s.value / seriesMax) * 100, s.value > 0 ? 3 : 0)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                {series.map((s, i) => (
                  <div
                    key={i}
                    className="flex-1 truncate text-center text-[10px] text-muted-foreground"
                  >
                    {i % labelEvery === 0 ? s.label : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top items + splits */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
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
              <ul className="space-y-2.5">
                {topProducts.map((p, i) => (
                  <li key={p.name + i} className="text-sm">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {p.qty} · {inr(p.revenue)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{ width: `${(p.qty / topMaxQty) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">By source</CardTitle>
              <CardDescription>Share of revenue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sources.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                sources.map(([src, val]) => (
                  <div key={src} className="text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {src}
                      </Badge>
                      <span className="text-muted-foreground tabular-nums">
                        {val.count} ·{" "}
                        {totalRevenue
                          ? Math.round((val.revenue / totalRevenue) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{
                          width: `${totalRevenue ? (val.revenue / totalRevenue) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Utensils className="h-4 w-4 text-muted-foreground" />
                Order types
              </CardTitle>
              <CardDescription>Share of orders.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {types.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                types.map(([t, count]) => (
                  <div key={t} className="text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="capitalize">{t}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {count} ·{" "}
                        {totalOrders
                          ? Math.round((count / totalOrders) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{
                          width: `${totalOrders ? (count / totalOrders) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sales by category + busiest hours */}
      {totalOrders > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4 text-muted-foreground" />
                Sales by category
              </CardTitle>
              <CardDescription>Revenue share by menu section.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {categories.map(([cat, rev]) => (
                <div key={cat} className="text-sm">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{cat}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {inr(rev)} ·{" "}
                      {totalRevenue ? Math.round((rev / totalRevenue) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${(rev / catMax) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Busiest hours
              </CardTitle>
              <CardDescription>Orders by time of day.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-32 items-end gap-1">
                {bizHours.map((b, i) => (
                  <div
                    key={i}
                    className="group flex h-full flex-1 items-end"
                    title={`${b.label}: ${b.count} orders`}
                  >
                    <div
                      className="w-full rounded-t bg-primary/85 transition-all group-hover:bg-primary"
                      style={{
                        height: `${Math.max((b.count / hourMax) * 100, b.count > 0 ? 4 : 0)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                {bizHours.map((b, i) => (
                  <div
                    key={i}
                    className="flex-1 text-center text-[10px] text-muted-foreground"
                  >
                    {i % 3 === 0 ? b.label : ""}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  deltaPct,
  deltaLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  deltaPct?: number | null;
  deltaLabel?: string;
}) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="text-xl font-semibold tabular-nums">{value}</div>
          </div>
        </div>
        {deltaPct !== null && deltaPct !== undefined && (
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
                up
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-rose-500/10 text-rose-600",
              )}
            >
              {up ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {up ? "+" : ""}
              {deltaPct}%
            </span>
            <span className="text-muted-foreground">{deltaLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
