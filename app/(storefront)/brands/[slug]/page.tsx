import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Building2,
  ChefHat,
  IndianRupee,
  MapPin,
  Plus,
  Receipt,
  ReceiptText,
  ShoppingBag,
  Store,
  TrendingDown,
  TrendingUp,
  Utensils,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { getCurrentUser, getUserRestaurants } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKey, hourOfDay, resolveTimeZone, startOfDay } from "@/lib/time";
import { AttachRestaurantForm } from "./AttachRestaurantForm";
import { DetachButton } from "./DetachButton";
import type {
  AppRole,
  Brand,
  OrderItem,
  ProductConfig,
  Restaurant,
} from "@/lib/types";

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

function formatINR(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatINRExact(n: number) {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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

export default async function BrandPage(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/brands/${params.slug}`)}`);

  const admin = createAdminClient();
  const [{ data: brandRow }, ownRestaurants] = await Promise.all([
    admin.from("brands").select("*").eq("slug", params.slug).maybeSingle(),
    getUserRestaurants(),
  ]);
  if (!brandRow) notFound();
  const brand = brandRow as Brand;

  const { data: attached } = await admin
    .from("restaurants")
    .select("*")
    .eq("brand_id", brand.id)
    .order("name");
  const attachedList = (attached ?? []) as Restaurant[];

  const roleByRestaurantId = new Map<string, AppRole>(
    ownRestaurants.map(({ restaurant, role }) => [restaurant.id, role]),
  );

  const isOwner = brand.owner_user_id === user.id;
  const isBrandRestaurantAdmin = attachedList.some(
    (r) => roleByRestaurantId.get(r.id) === "admin",
  );
  if (!isOwner && !isBrandRestaurantAdmin) {
    notFound();
  }

  const rawRange = (searchParams.range ?? "today") as Range;
  const validRange: Range = ["today", "yesterday", "7d", "30d"].includes(
    rawRange,
  )
    ? rawRange
    : "today";

  const restIds = attachedList.map((r) => r.id);
  const { data: outletsData } = restIds.length
    ? await admin
        .from("outlets")
        .select("id, name, city, restaurant_id, status, timezone")
        .in("restaurant_id", restIds)
    : { data: [] };

  const outlets = outletsData ?? [];
  const outletIds = outlets.map((o) => o.id);
  const timeZone = resolveTimeZone(outlets[0]?.timezone);
  const { start, end } = rangeBounds(validRange, timeZone);

  const periodMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - periodMs);

  const [{ data: ordersData }, { data: prevData }, { data: liveQueueData }] =
    outletIds.length > 0
      ? await Promise.all([
          admin
            .from("orders")
            .select(
              "id, outlet_id, source, status, order_type, customer_email, total_amount, cgst_amount, sgst_amount, gst_paid_by_operator, placed_at, order_items(id, order_id, quantity, total_amount:total_price, total_price, product_config)",
            )
            .in("outlet_id", outletIds)
            .gte("placed_at", start.toISOString())
            .lte("placed_at", end.toISOString())
            .neq("status", "cancelled")
            .order("placed_at", { ascending: true }),
          admin
            .from("orders")
            .select("id, outlet_id, customer_email, source, total_amount")
            .in("outlet_id", outletIds)
            .gte("placed_at", prevStart.toISOString())
            .lte("placed_at", prevEnd.toISOString())
            .neq("status", "cancelled"),
          admin
            .from("orders")
            .select("id, outlet_id, status")
            .in("outlet_id", outletIds)
            .in("status", ["pending", "confirmed", "preparing", "ready"]),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const outletToRest = new Map<string, string>(
    outlets.map((o) => [o.id, o.restaurant_id]),
  );

  type RestStat = {
    restaurant: Restaurant;
    outletsCount: number;
    orders: number;
    openTables: number;
    revenue: number;
    gst: number;
    liveQueue: number;
  };

  const statsByRest = new Map<string, RestStat>();
  for (const r of attachedList) {
    statsByRest.set(r.id, {
      restaurant: r,
      outletsCount: outlets.filter((o) => o.restaurant_id === r.id).length,
      orders: 0,
      openTables: 0,
      revenue: 0,
      gst: 0,
      liveQueue: 0,
    });
  }

  let totalBrandLiveQueue = 0;
  for (const q of liveQueueData ?? []) {
    const rid = outletToRest.get(q.outlet_id);
    if (!rid) continue;
    const st = statsByRest.get(rid);
    if (st) st.liveQueue += 1;
    totalBrandLiveQueue += 1;
  }

  let totalBrandOrders = 0;
  let totalBrandRevenue = 0;
  let totalBrandGst = 0;
  const allItems: OrderItem[] = [];
  const sourceTotals = new Map<string, { count: number; revenue: number }>();
  const typeTotals = new Map<string, { count: number; revenue: number }>();

  const settledOrders: Array<{
    placed_at: string;
    total_amount: number;
  }> = [];

  for (const raw of ordersData ?? []) {
    const rid = outletToRest.get(raw.outlet_id);
    if (!rid) continue;
    const st = statsByRest.get(rid);
    if (!st) continue;

    const isOpenPosTable =
      raw.source === "pos" &&
      (raw.customer_email ?? "").toLowerCase().startsWith("pos+open");
    if (isOpenPosTable) {
      st.openTables += 1;
      continue;
    }

    const amt = Number(raw.total_amount ?? 0);
    const oItems = (raw.order_items ?? []) as unknown as OrderItem[];
    allItems.push(...oItems);

    const orderGst = raw.gst_paid_by_operator
      ? 0
      : Number(raw.cgst_amount ?? 0) + Number(raw.sgst_amount ?? 0) > 0
        ? Number(raw.cgst_amount ?? 0) + Number(raw.sgst_amount ?? 0)
        : gstFromItems(oItems);

    st.orders += 1;
    st.revenue += amt;
    st.gst += orderGst;

    totalBrandOrders += 1;
    totalBrandRevenue += amt;
    totalBrandGst += orderGst;
    settledOrders.push({
      placed_at: raw.placed_at,
      total_amount: amt,
    });

    const srcCur = sourceTotals.get(raw.source) ?? { count: 0, revenue: 0 };
    srcCur.count += 1;
    srcCur.revenue += amt;
    sourceTotals.set(raw.source, srcCur);

    const tKey = raw.order_type ?? "takeaway";
    const typCur = typeTotals.get(tKey) ?? { count: 0, revenue: 0 };
    typCur.count += 1;
    typCur.revenue += amt;
    typeTotals.set(tKey, typCur);
  }

  let prevOrders = 0;
  let prevRevenue = 0;
  for (const p of prevData ?? []) {
    if (
      p.source === "pos" &&
      (p.customer_email ?? "").toLowerCase().startsWith("pos+open")
    ) {
      continue;
    }
    prevOrders += 1;
    prevRevenue += Number(p.total_amount ?? 0);
  }

  const brandAov = totalBrandOrders ? totalBrandRevenue / totalBrandOrders : 0;
  const prevAov = prevOrders ? prevRevenue / prevOrders : 0;
  const delta = (cur: number, prev: number): number | null =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

  // Time series (hourly for Today/Yesterday, daily for 7d/30d)
  const isHourly = validRange === "today" || validRange === "yesterday";
  const series: { label: string; value: number }[] = [];
  if (isHourly) {
    const map = new Map<number, number>();
    for (let h = 7; h <= 23; h++) map.set(h, 0);
    for (const o of settledOrders) {
      const h = hourOfDay(new Date(o.placed_at), timeZone);
      if (!map.has(h)) map.set(h, 0);
      map.set(h, (map.get(h) ?? 0) + o.total_amount);
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
    for (const o of settledOrders) {
      const key = dayKey(new Date(o.placed_at), timeZone);
      const bucket = map.get(key);
      if (bucket) bucket.value += o.total_amount;
    }
    series.push(...map.values());
  }
  const seriesMax = Math.max(...series.map((s) => s.value), 1);
  const labelEvery = Math.ceil(series.length / 8);

  // Top-selling items across the brand
  const itemMap = new Map<
    string,
    { name: string; qty: number; revenue: number }
  >();
  for (const it of allItems) {
    const cfg = it.product_config as unknown as ProductConfig | null;
    const key = cfg?.name ?? `#${cfg?.product_id ?? it.id}`;
    const cur = itemMap.get(key) ?? { name: key, qty: 0, revenue: 0 };
    cur.qty += it.quantity;
    cur.revenue += Number(it.total_price ?? 0);
    itemMap.set(key, cur);
  }
  const topProducts = [...itemMap.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);
  const topMaxQty = Math.max(...topProducts.map((p) => p.qty), 1);

  const sources = [...sourceTotals.entries()].sort(
    (a, b) => b[1].revenue - a[1].revenue,
  );
  const types = [...typeTotals.entries()].sort(
    (a, b) => b[1].count - a[1].count,
  );

  const rankedRestaurants = [...statsByRest.values()].sort(
    (a, b) => b.revenue - a.revenue,
  );

  // Restaurants the user admins that AREN'T attached to any brand
  const attachable = ownRestaurants
    .filter(({ role }) => role === "admin")
    .map(({ restaurant }) => restaurant)
    .filter((r) => r.brand_id === null);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {brand.name}
              </h1>
              <Badge variant="secondary">Franchise HQ</Badge>
              <Badge variant="outline" className="text-[11px]">
                {isOwner ? "Brand Owner" : "Franchise Admin"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Consolidated multi-restaurant reports, GST roll-up &amp; live
              operations ({RANGE_LABEL[validRange]})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <nav className="inline-flex items-center rounded-[10px] bg-muted p-0.5">
            {(["today", "yesterday", "7d", "30d"] as const).map((r) => (
              <Link
                key={r}
                href={`/brands/${brand.slug}?range=${r}`}
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

          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            ← All Workspaces
          </Link>
        </div>
      </header>

      {/* Consolidated Brand Roll-Up KPIs */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <BrandStat
          icon={IndianRupee}
          label="Brand revenue"
          value={formatINR(totalBrandRevenue)}
          deltaPct={delta(totalBrandRevenue, prevRevenue)}
          deltaLabel={PREV_LABEL[validRange]}
        />
        <BrandStat
          icon={ReceiptText}
          label="Settled orders"
          value={String(totalBrandOrders)}
          deltaPct={delta(totalBrandOrders, prevOrders)}
          deltaLabel={PREV_LABEL[validRange]}
        />
        <BrandStat
          icon={TrendingUp}
          label="Brand avg. order"
          value={totalBrandOrders ? formatINR(brandAov) : "—"}
          deltaPct={delta(brandAov, prevAov)}
          deltaLabel={PREV_LABEL[validRange]}
        />
        <BrandStat
          icon={Receipt}
          label="Brand GST payable"
          value={formatINR(totalBrandGst)}
          sub={`CGST ${formatINR(totalBrandGst / 2)} · SGST ${formatINR(totalBrandGst / 2)}`}
        />
        <BrandStat
          icon={ChefHat}
          label="Live kitchen queue"
          value={String(totalBrandLiveQueue)}
          sub={`${attachedList.length} restaurants · ${outlets.length} outlets`}
        />
      </section>

      {/* Per-Restaurant Performance Comparison Table */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Restaurant comparison · {RANGE_LABEL[validRange]}
            </CardTitle>
            <CardDescription>
              Side-by-side revenue, order volume, GST liability, and live kitchen
              queue across every restaurant in {brand.name}.
            </CardDescription>
          </div>
          <Badge variant="secondary">{attachedList.length} restaurants</Badge>
        </CardHeader>
        <CardContent className="pt-3">
          {rankedRestaurants.length === 0 ? (
            <EmptyState
              icon={Store}
              title="No restaurants attached yet"
              description="Use the form below to attach a restaurant you admin."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Restaurant</TableHead>
                  <TableHead className="text-right">Outlets</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Avg. Order</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Gross Revenue</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Live KDS</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {rankedRestaurants.map((st) => {
                  const r = st.restaurant;
                  const sharePct = totalBrandRevenue
                    ? Math.round((st.revenue / totalBrandRevenue) * 100)
                    : 0;
                  const aov = st.orders ? st.revenue / st.orders : 0;
                  const myRole = roleByRestaurantId.get(r.id);
                  const canOpenRestAdmin =
                    myRole === "admin" || myRole === "manager";
                  const canOpenRestPos = Boolean(myRole);
                  const canDetach = isOwner || myRole === "admin";

                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-semibold text-foreground">
                          {r.name}
                        </div>
                        {st.openTables > 0 && (
                          <div className="text-[11px] text-amber-700">
                            {st.openTables} open{" "}
                            {st.openTables === 1 ? "table" : "tables"} running
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {st.outletsCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {st.orders}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {st.orders ? formatINR(aov) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatINRExact(st.gst)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatINRExact(st.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {sharePct}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {st.liveQueue > 0 ? (
                          <Badge variant="secondary" className="text-[11px]">
                            {st.liveQueue} active
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {canOpenRestAdmin && (
                            <Link
                              href={`/r/${r.slug}/admin/reports?range=${validRange}`}
                              className={cn(
                                buttonVariants({
                                  variant: "default",
                                  size: "xs",
                                }),
                              )}
                            >
                              Admin
                            </Link>
                          )}
                          {canOpenRestPos && (
                            <Link
                              href={`/r/${r.slug}/pos`}
                              className={cn(
                                buttonVariants({
                                  variant: "outline",
                                  size: "xs",
                                }),
                              )}
                            >
                              POS
                            </Link>
                          )}
                          <Link
                            href={`/r/${r.slug}`}
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "xs" }),
                            )}
                          >
                            Storefront ↗
                          </Link>
                          {canDetach && (
                            <DetachButton
                              brandId={brand.id}
                              restaurantId={r.id}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Brand Revenue Trend + Top Selling Items + Channel/Type Mix */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Brand revenue trend
            </CardTitle>
            <CardDescription>
              {isHourly ? "Hourly breakdown" : "Daily breakdown"} across all
              outlets · {RANGE_LABEL[validRange]}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {totalBrandOrders === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No settled brand sales in this range"
                description="Switch to Last 7 days or Last 30 days to inspect historical brand roll-ups."
              />
            ) : (
              <div>
                <div className="flex h-40 items-end gap-1">
                  {series.map((s, i) => (
                    <div
                      key={i}
                      className="group relative flex h-full flex-1 items-end"
                      title={`${s.label}: ${formatINR(s.value)}`}
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
                      className="flex-1 truncate text-center text-[11px] tabular-nums text-muted-foreground"
                    >
                      {i % labelEvery === 0 ? s.label : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-5">
          <Card>
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Store className="h-4 w-4 text-muted-foreground" />
                Brand channel mix
              </CardTitle>
              <CardDescription>
                POS vs Direct Storefront vs Delivery platforms.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              {sources.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  No orders in this range.
                </p>
              ) : (
                sources.map(([src, val]) => {
                  const pct = totalBrandRevenue
                    ? Math.round((val.revenue / totalBrandRevenue) * 100)
                    : 0;
                  return (
                    <div key={src} className="text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className="text-[11px] uppercase"
                        >
                          {src}
                        </Badge>
                        <span className="tabular-nums text-muted-foreground">
                          {val.count} · {formatINR(val.revenue)} ({pct}%)
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

          <Card>
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Utensils className="h-4 w-4 text-muted-foreground" />
                Order types across brand
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              {types.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  No orders in this range.
                </p>
              ) : (
                types.map(([t, val]) => {
                  const pct = totalBrandOrders
                    ? Math.round((val.count / totalBrandOrders) * 100)
                    : 0;
                  return (
                    <div key={t} className="text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium capitalize">{t}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {val.count} orders · {formatINR(val.revenue)} ({pct}%)
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
      </div>

      {/* Top Selling Dishes Across Brand */}
      <Card>
        <CardHeader className="border-b border-border/60 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            Top selling items across {brand.name}
          </CardTitle>
          <CardDescription>
            Best-performing dishes consolidated across all franchise kitchens (
            {RANGE_LABEL[validRange]}).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-3">
          {topProducts.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No item sales recorded in {RANGE_LABEL[validRange].toLowerCase()}.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {topProducts.map((p, i) => (
                <div
                  key={p.name + i}
                  className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">
                      <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {p.name}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {p.qty}× · {formatINR(p.revenue)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${(p.qty / topMaxQty) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Attach an independent restaurant
        </h2>
        {attachable.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No independent restaurants available to attach. You can attach
              restaurants where you are admin and which aren&apos;t in another
              brand yet.
              <div className="mt-3">
                <Link
                  href="/signup"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                  )}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Create a new restaurant
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <AttachRestaurantForm
                brandId={brand.id}
                restaurants={attachable}
              />
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function BrandStat({
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
        <div className="text-2xl font-semibold tracking-tight tabular-nums">
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
          ) : sub ? (
            <span className="truncate text-muted-foreground">{sub}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
