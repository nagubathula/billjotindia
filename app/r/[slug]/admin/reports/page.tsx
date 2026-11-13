import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BarChart3,
  Clock,
  FileSpreadsheet,
  IndianRupee,
  Layers,
  Receipt,
  ShoppingBag,
  Store,
  TrendingDown,
  TrendingUp,
  Utensils,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantBySlug } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { dayKey, hourOfDay, resolveTimeZone, startOfDay } from "@/lib/time";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function rangeBounds(r: Range, timeZone: string): { start: Date; end: Date } {
  const now = new Date();
  const dayStart = (dayOffset: number) => startOfDay(now, timeZone, dayOffset);
  const dayEnd = (dayOffset: number) =>
    new Date(dayStart(dayOffset + 1).getTime() - 1);

  switch (r) {
    case "today":
      return { start: dayStart(0), end: dayEnd(0) };
    case "yesterday":
      return { start: dayStart(-1), end: dayEnd(-1) };
    case "7d":
      return { start: dayStart(-6), end: dayEnd(0) };
    case "30d":
      return { start: dayStart(-29), end: dayEnd(0) };
  }
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const inrExact = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
};

export default async function ReportsPage(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const range = ((searchParams.range as Range) ?? "today") as Range;
  const validRange: Range = ["today", "yesterday", "7d", "30d"].includes(range)
    ? range
    : "today";

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const timeZone = resolveTimeZone(outlets[0]?.timezone);
  const { start, end } = rangeBounds(validRange, timeZone);
  const outletIds = outlets.map((o) => o.id);
  const scoped =
    outletIds.length > 0
      ? outletIds
      : ["00000000-0000-0000-0000-000000000000"];

  const supabase = await createClient();

  const periodMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - periodMs);

  const [{ data: ordersData }, { data: prevData }, { data: prods }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("*, order_items(*)")
        .in("outlet_id", scoped)
        .gte("placed_at", start.toISOString())
        .lte("placed_at", end.toISOString())
        .neq("status", "cancelled")
        .order("placed_at", { ascending: true }),
      supabase
        .from("orders")
        .select("total_amount")
        .in("outlet_id", scoped)
        .gte("placed_at", prevStart.toISOString())
        .lte("placed_at", prevEnd.toISOString())
        .neq("status", "cancelled"),
      supabase.from("products").select("id, category").in("outlet_id", scoped),
    ]);

  const orders: Order[] = [];
  const items: OrderItem[] = [];
  const firstItemByOrder = new Map<string, OrderItem>();
  for (const { order_items, ...order } of ordersData ?? []) {
    orders.push(order as Order);
    const oItems = (order_items ?? []) as OrderItem[];
    items.push(...oItems);
    if (oItems[0]) firstItemByOrder.set(order.id, oItems[0]);
  }

  const prevOrders = prevData?.length ?? 0;
  const prevRevenue = (prevData ?? []).reduce(
    (s, o) => s + Number(o.total_amount),
    0,
  );

  // ---- Aggregates ----
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount), 0);
  const aov = totalOrders ? totalRevenue / totalOrders : 0;
  const prevAov = prevOrders ? prevRevenue / prevOrders : 0;

  const operatorGstOrders = new Set(
    orders.filter((o) => o.gst_paid_by_operator).map((o) => o.id),
  );
  const directOrdersRevenue = orders
    .filter((o) => !operatorGstOrders.has(o.id))
    .reduce((s, o) => s + Number(o.total_amount), 0);
  const operatorOrdersRevenue = orders
    .filter((o) => operatorGstOrders.has(o.id))
    .reduce((s, o) => s + Number(o.total_amount), 0);

  const totalGst = gstFromItems(
    items.filter((it) => !operatorGstOrders.has(it.order_id ?? "")),
  );
  const taxableSales = Math.max(0, directOrdersRevenue - totalGst);

  const delta = (cur: number, prev: number): number | null =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

  // ---- Time series ----
  const isHourly = validRange === "today" || validRange === "yesterday";
  const series: { label: string; value: number }[] = [];
  if (isHourly) {
    const map = new Map<number, number>();
    for (let h = 7; h <= 23; h++) map.set(h, 0);
    for (const o of orders) {
      const h = hourOfDay(new Date(o.placed_at as string), timeZone);
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
      const d = startOfDay(end, timeZone, -i);
      map.set(dayKey(d, timeZone), {
        label: d.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          timeZone,
        }),
        value: 0,
      });
    }
    for (const o of orders) {
      const key = dayKey(new Date(o.placed_at as string), timeZone);
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
    .slice(0, 10);
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

  // ---- Payment / Tender mode split (for cash drawer reconciliation) ----
  const tenderTotals = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    let mode = o.source === "pos" ? "cash" : o.source === "web" || o.source === "kiosk" ? "online" : "aggregator";
    if (o.source === "pos") {
      const firstIt = firstItemByOrder.get(o.id);
      const cfg = firstIt?.product_config as unknown as { tender_mode?: string } | null;
      if (cfg?.tender_mode) mode = cfg.tender_mode.toLowerCase();
      else if (o.customer_email?.startsWith("pos+")) {
        mode = o.customer_email.split("@")[0].replace("pos+", "");
      }
    }
    const cur = tenderTotals.get(mode) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(o.total_amount);
    tenderTotals.set(mode, cur);
  }
  const tenders = Array.from(tenderTotals.entries()).sort(
    (a, b) => b[1].revenue - a[1].revenue,
  );

  // ---- Order-type split ----
  const typeTotals = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    const t = o.order_type ?? "other";
    const cur = typeTotals.get(t) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(o.total_amount);
    typeTotals.set(t, cur);
  }
  const types = Array.from(typeTotals.entries()).sort(
    (a, b) => b[1].count - a[1].count,
  );

  // ---- Sales by category ----
  const prodCat = new Map<string, string>();
  for (const p of prods ?? []) prodCat.set(p.id, p.category ?? "Other");
  const catTotals = new Map<string, number>();
  for (const it of items) {
    const cfg = it.product_config as unknown as ProductConfig | null;
    const cat =
      (cfg?.product_id != null && prodCat.get(cfg.product_id)) || "Other";
    catTotals.set(cat, (catTotals.get(cat) ?? 0) + Number(it.total_price));
  }
  const categories = Array.from(catTotals.entries()).sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(...categories.map((c) => c[1]), 1);

  // ---- Busiest hours ----
  const hourCounts = new Array(24).fill(0);
  for (const o of orders)
    hourCounts[hourOfDay(new Date(o.placed_at as string), timeZone)]++;
  const bizHours: { label: string; count: number }[] = [];
  for (let h = 7; h <= 23; h++)
    bizHours.push({ label: hourLabel(h), count: hourCounts[h] });
  const hourMax = Math.max(...bizHours.map((b) => b.count), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & GST"
        description={`${RANGE_LABEL[validRange]} performance and tax summary. Cancelled orders excluded.`}
        actions={
          <nav className="inline-flex items-center rounded-[10px] bg-muted p-0.5">
            {(["today", "yesterday", "7d", "30d"] as const).map((r) => (
              <Link
                key={r}
                href={`/r/${params.slug}/admin/reports?range=${r}`}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                  r === validRange
                    ? "bg-card text-foreground shadow-control"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {RANGE_LABEL[r]}
              </Link>
            ))}
          </nav>
        }
      />

      {/* Primary KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={IndianRupee}
          label="Gross revenue"
          value={inr(totalRevenue)}
          deltaPct={delta(totalRevenue, prevRevenue)}
          deltaLabel={PREV_LABEL[validRange]}
        />
        <Stat
          icon={ShoppingBag}
          label="Billed orders"
          value={totalOrders.toString()}
          deltaPct={delta(totalOrders, prevOrders)}
          deltaLabel={PREV_LABEL[validRange]}
        />
        <Stat
          icon={TrendingUp}
          label="Average order"
          value={totalOrders ? inr(aov) : "—"}
          deltaPct={delta(aov, prevAov)}
          deltaLabel={PREV_LABEL[validRange]}
        />
        <Stat
          icon={Receipt}
          label="Net GST liability"
          value={inr(totalGst)}
          sub={`CGST ${inr(totalGst / 2)} · SGST ${inr(totalGst / 2)}`}
        />
      </section>

      {/* Revenue trend chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
              Revenue trend
            </CardTitle>
            <CardDescription>
              {isHourly ? "Hourly breakdown" : "Daily breakdown"} ·{" "}
              {RANGE_LABEL[validRange]}
            </CardDescription>
          </div>
          {totalOrders > 0 && (
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground">Peak period</div>
              <div className="text-xs font-semibold tabular-nums">
                {peak.label} · {inr(peak.value)}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-3">
          {totalOrders === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No sales in this range"
              description="Pick a different time range, or wait for orders to come in."
            />
          ) : (
            <div>
              <div className="flex h-40 items-end gap-1">
                {series.map((s, i) => (
                  <div
                    key={i}
                    className="group relative flex h-full flex-1 items-end"
                    title={`${s.label}: ${inr(s.value)}`}
                  >
                    <div
                      className="w-full rounded-t bg-primary/85 transition-all group-hover:bg-primary"
                      style={{
                        height: `${Math.max((s.value / seriesMax) * 100, s.value > 0 ? 4 : 1)}%`,
                        opacity: s.value > 0 ? 1 : 0.15,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                {series.map((s, i) => (
                  <div
                    key={i}
                    className="flex-1 truncate text-center tabular-nums text-[11px] text-muted-foreground"
                  >
                    {i % labelEvery === 0 ? s.label : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* GST & Cash Drawer Reconciliation Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
              GST tax summary
            </CardTitle>
            <CardDescription>
              First-party tax liability vs Section 9(5) operator-remitted tax.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Table>
              <TableBody className="text-xs">
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    First-party gross sales (POS / Web / Kiosk)
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {inrExact(directOrdersRevenue)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    Taxable value (excl. GST)
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inrExact(taxableSales)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    CGST collected
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inrExact(totalGst / 2)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    SGST collected
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inrExact(totalGst / 2)}
                  </TableCell>
                </TableRow>
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell>Total restaurant GST payable</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inrExact(totalGst)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    Section 9(5) aggregator sales (Zomato / Swiggy pays GST)
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {inrExact(operatorOrdersRevenue)} ({operatorGstOrders.size}{" "}
                    orders)
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
              Tender & collection modes
            </CardTitle>
            <CardDescription>
              Reconcile POS Cash, UPI, Card, and platform settlements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            {tenders.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No payments recorded in this range.
              </p>
            ) : (
              tenders.map(([mode, val]) => {
                const pct = totalRevenue
                  ? Math.round((val.revenue / totalRevenue) * 100)
                  : 0;
                return (
                  <div key={mode} className="text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="font-mono text-[11px] uppercase"
                        >
                          {mode}
                        </Badge>
                        <span className="text-muted-foreground">
                          {val.count} {val.count === 1 ? "bill" : "bills"}
                        </span>
                      </div>
                      <span className="font-medium tabular-nums">
                        {inr(val.revenue)} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top items + Source & Order Type splits */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle>Top selling items</CardTitle>
            <CardDescription>Ranked by quantity sold.</CardDescription>
          </CardHeader>
          <CardContent className="pt-3">
            {topProducts.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="No item sales"
                description="Pick a different time range, or wait for orders to come in."
              />
            ) : (
              <ul className="space-y-2.5">
                {topProducts.map((p, i) => (
                  <li key={p.name + i} className="text-xs">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="truncate font-medium text-foreground">
                        <span className="mr-2 tabular-nums text-[11px] text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {p.name}
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {p.qty}× · {inr(p.revenue)}
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

        <div className="space-y-4 lg:col-span-5">
          <Card>
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Store className="h-3.5 w-3.5 text-muted-foreground" />
                By channel source
              </CardTitle>
              <CardDescription>Revenue share across platforms.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              {sources.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                sources.map(([src, val]) => (
                  <div key={src} className="text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <Badge variant="outline" className="text-[11px] uppercase">
                        {src}
                      </Badge>
                      <span className="text-muted-foreground tabular-nums">
                        {val.count} · {inr(val.revenue)} (
                        {totalRevenue
                          ? Math.round((val.revenue / totalRevenue) * 100)
                          : 0}
                        %)
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
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Utensils className="h-3.5 w-3.5 text-muted-foreground" />
                Order types
              </CardTitle>
              <CardDescription>Dine-in, takeaway, and delivery mix.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              {types.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                types.map(([t, val]) => (
                  <div key={t} className="text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium capitalize">{t}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {val.count} orders · {inr(val.revenue)} (
                        {totalOrders
                          ? Math.round((val.count / totalOrders) * 100)
                          : 0}
                        %)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{
                          width: `${totalOrders ? (val.count / totalOrders) * 100 : 0}%`,
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

      {/* Category revenue & Busiest hours */}
      {totalOrders > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                Sales by category
              </CardTitle>
              <CardDescription>Revenue share by menu section.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              {categories.map(([cat, rev]) => (
                <div key={cat} className="text-xs">
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
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Busiest hours
              </CardTitle>
              <CardDescription>Order volume by time of day.</CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
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
                        height: `${Math.max((b.count / hourMax) * 100, b.count > 0 ? 4 : 1)}%`,
                        opacity: b.count > 0 ? 1 : 0.15,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                {bizHours.map((b, i) => (
                  <div
                    key={i}
                    className="flex-1 text-center tabular-nums text-[11px] text-muted-foreground"
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
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  deltaPct?: number | null;
  deltaLabel?: string;
  sub?: string;
}) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <Card size="sm">
      <CardContent className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </div>
        <div className="h-4 text-[11px]">
          {deltaPct !== null && deltaPct !== undefined ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-medium",
                  up ? "text-emerald-600" : "text-rose-600",
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
            </span>
          ) : (
            <span className="text-muted-foreground">{sub ?? ""}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
