import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BarChart3,
  Bike,
  ChefHat,
  ChevronRight,
  Clock,
  ExternalLink,
  IndianRupee,
  ListOrdered,
  MonitorSmartphone,
  Receipt,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Utensils,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantBySlug } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { hourOfDay, resolveTimeZone, startOfDay } from "@/lib/time";
import { CHANNEL_LABEL } from "@/lib/channels";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import type {
  AggregatorChannel,
  ChannelOutlet,
  Order,
  OrderItem,
  ProductConfig,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const OPEN_STATUSES = ["pending", "confirmed", "preparing", "ready"] as const;

const QUEUE_META: Record<
  (typeof OPEN_STATUSES)[number],
  { label: string; dot: string }
> = {
  pending: { label: "New", dot: "bg-amber-500" },
  confirmed: { label: "Accepted", dot: "bg-sky-500" },
  preparing: { label: "Preparing", dot: "bg-violet-500" },
  ready: { label: "Ready", dot: "bg-emerald-500" },
};

const FIRST_PARTY_LABEL: Record<string, string> = {
  pos: "POS",
  kiosk: "Kiosk",
  web: "Web",
};

function sourceLabel(source: string | null) {
  if (!source) return "";
  return (
    FIRST_PARTY_LABEL[source] ??
    CHANNEL_LABEL[source as AggregatorChannel] ??
    source
  );
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function minutesAgo(iso: string | null, now: number) {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

function hourLabel(h: number) {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

type Props = { params: Promise<{ slug: string }> };

export default async function AdminOverviewPage(props: Props) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);
  const scoped = outletIds.length > 0 ? outletIds : [NIL_UUID];

  const timeZone = resolveTimeZone(outlets[0]?.timezone);
  const now = new Date();
  const todayStart = startOfDay(now, timeZone);
  const yesterdayStart = startOfDay(now, timeZone, -1);
  const yesterdaySameTime = new Date(
    yesterdayStart.getTime() + (now.getTime() - todayStart.getTime()),
  );

  const supabase = await createClient();
  const [
    { data: todayData },
    { data: yesterdayData },
    { data: openData },
    { count: activeProducts },
    { count: inactiveProducts },
    { data: channelLinks },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total_amount, status, placed_at, source, order_type")
      .in("outlet_id", scoped)
      .gte("placed_at", todayStart.toISOString())
      .neq("status", "cancelled"),
    supabase
      .from("orders")
      .select("total_amount")
      .in("outlet_id", scoped)
      .gte("placed_at", yesterdayStart.toISOString())
      .lte("placed_at", yesterdaySameTime.toISOString())
      .neq("status", "cancelled"),
    supabase
      .from("orders")
      .select("*")
      .in("outlet_id", scoped)
      .in("status", [...OPEN_STATUSES])
      .order("placed_at", { ascending: true })
      .limit(50),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .in("outlet_id", scoped)
      .eq("status", "active"),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .in("outlet_id", scoped)
      .neq("status", "active"),
    supabase
      .from("channel_outlets")
      .select("*")
      .in("outlet_id", scoped),
  ]);

  const today = (todayData ?? []) as Pick<
    Order,
    "id" | "total_amount" | "status" | "placed_at" | "source" | "order_type"
  >[];
  const openOrders = (openData ?? []) as Order[];
  const channels = (channelLinks ?? []) as ChannelOutlet[];
  const onlineChannels = channels.filter((c) => c.is_online).length;

  const revenue = today.reduce((s, o) => s + Number(o.total_amount), 0);
  const prevRevenue = (yesterdayData ?? []).reduce(
    (s, o) => s + Number(o.total_amount),
    0,
  );
  const orderCount = today.length;
  const prevCount = yesterdayData?.length ?? 0;
  const aov = orderCount > 0 ? revenue / orderCount : 0;

  const queueCounts = Object.fromEntries(
    OPEN_STATUSES.map((s) => [s, openOrders.filter((o) => o.status === s).length]),
  ) as Record<(typeof OPEN_STATUSES)[number], number>;

  // Today's hourly sales sparkbars (8 AM to 11 PM)
  const hourlyMap = new Map<number, number>();
  for (let h = 8; h <= 23; h++) hourlyMap.set(h, 0);
  for (const o of today) {
    if (!o.placed_at) continue;
    const h = hourOfDay(new Date(o.placed_at), timeZone);
    hourlyMap.set(h, (hourlyMap.get(h) ?? 0) + Number(o.total_amount));
  }
  const hourlySeries = Array.from(hourlyMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([h, v]) => ({ label: hourLabel(h), value: v }));
  const hourlyMax = Math.max(...hourlySeries.map((s) => s.value), 1);

  // Top sellers today
  let topItems: { name: string; qty: number; revenue: number }[] = [];
  if (today.length > 0) {
    const { data: itemData } = await supabase
      .from("order_items")
      .select("product_config, quantity, total_price")
      .in(
        "order_id",
        today.map((o) => o.id),
      );
    const byName = new Map<string, { qty: number; revenue: number }>();
    for (const it of (itemData ?? []) as Pick<
      OrderItem,
      "product_config" | "quantity" | "total_price"
    >[]) {
      const name =
        (it.product_config as unknown as ProductConfig)?.name ?? "Item";
      const cur = byName.get(name) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(it.quantity) || 0;
      cur.revenue += Number(it.total_price) || 0;
      byName.set(name, cur);
    }
    topItems = Array.from(byName, ([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }

  const base = `/r/${restaurant.slug}/admin`;
  const nowMs = now.getTime();
  const dateLabel = now.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description={`${restaurant.name} · ${dateLabel} · ${outlets.length} ${outlets.length === 1 ? "outlet" : "outlets"}`}
        actions={
          <>
            <Link
              href={`/r/${restaurant.slug}`}
              target="_blank"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Storefront <ExternalLink className="opacity-60" />
            </Link>
            <Link
              href={`${base}/kitchen`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ChefHat /> Kitchen
            </Link>
            <Link
              href={`/r/${restaurant.slug}/pos`}
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              <MonitorSmartphone /> Open POS
            </Link>
          </>
        }
      />

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={IndianRupee}
          label="Revenue today"
          value={inr(revenue)}
          current={revenue}
          previous={prevRevenue}
        />
        <StatCard
          icon={Receipt}
          label="Orders today"
          value={String(orderCount)}
          current={orderCount}
          previous={prevCount}
        />
        <StatCard
          icon={BarChart3}
          label="Average order"
          value={inr(aov)}
          hint={orderCount > 0 ? `${orderCount} billed today` : "No orders yet"}
        />
        <StatCard
          icon={Clock}
          label="Kitchen queue"
          value={String(openOrders.length)}
          hint={
            openOrders.length > 0
              ? `${queueCounts.pending} new · ${queueCounts.preparing} cooking`
              : "All caught up"
          }
        />
      </div>

      {/* Main operational grid */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left 7 cols: Live Queue + Hourly Pulse */}
        <div className="space-y-4 lg:col-span-7">
          <Card>
            <CardHeader>
              <CardTitle>Live orders</CardTitle>
              <CardDescription>
                Open tickets from the POS, storefront and aggregators.
              </CardDescription>
              <CardAction>
                <Link
                  href={`${base}/orders`}
                  className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                >
                  All orders <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {OPEN_STATUSES.map((s) => (
                  <div key={s} className="rounded-xl bg-background px-3.5 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className={cn("h-2 w-2 rounded-full", QUEUE_META[s].dot)}
                      />
                      <span className="truncate">{QUEUE_META[s].label}</span>
                    </div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                      {queueCounts[s]}
                    </div>
                  </div>
                ))}
              </div>

              {openOrders.length === 0 ? (
                <EmptyState
                  icon={ListOrdered}
                  title="Queue is clear"
                  description="New orders from the counter POS and online storefront appear here live."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {openOrders.slice(0, 8).map((o) => {
                    const s = (o.status ??
                      "pending") as (typeof OPEN_STATUSES)[number];
                    return (
                      <li key={o.id}>
                        <Link
                          href={`${base}/orders/${o.id}`}
                          className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/50"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                "h-2.5 w-2.5 shrink-0 rounded-full",
                                QUEUE_META[s]?.dot ?? "bg-muted",
                              )}
                            />
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-2 text-sm font-medium text-foreground">
                                <span className="truncate">
                                  {o.customer_name || "Walk-in"}
                                </span>
                                <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                                  {o.token_number
                                    ? `#${o.token_number}`
                                    : o.unique_order_id}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span>{QUEUE_META[s]?.label ?? s}</span>
                                <span aria-hidden>·</span>
                                <span className="capitalize">
                                  {o.order_type ?? "order"}
                                </span>
                                <span aria-hidden>·</span>
                                <span>{sourceLabel(o.source)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <div className="text-right">
                              <div className="text-sm font-semibold tabular-nums text-foreground">
                                {inr(Number(o.total_amount))}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {minutesAgo(o.placed_at, nowMs)}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Today's Hourly Momentum */}
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s pace</CardTitle>
              <CardDescription>Sales by hour, 8 AM to 11 PM.</CardDescription>
              <CardAction>
                <Link
                  href={`${base}/reports`}
                  className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                >
                  Reports <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="flex h-32 items-end gap-1.5">
                {hourlySeries.map((s, i) => (
                  <div
                    key={i}
                    className="group flex h-full flex-1 items-end"
                    title={`${s.label}: ${inr(s.value)}`}
                  >
                    <div
                      className={cn(
                        "w-full rounded-full transition-colors",
                        s.value > 0
                          ? "bg-primary group-hover:bg-primary/80"
                          : "bg-muted",
                      )}
                      style={{
                        height: `${Math.max((s.value / hourlyMax) * 100, s.value > 0 ? 8 : 4)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5">
                {hourlySeries.map((s, i) => (
                  <div
                    key={i}
                    className="flex-1 text-center text-[11px] tabular-nums text-muted-foreground"
                  >
                    {i % 3 === 0 ? s.label : ""}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 5 cols: Top Sellers + Catalog & Channel Health */}
        <div className="space-y-4 lg:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle>Top sellers</CardTitle>
              <CardDescription>Today, by quantity sold.</CardDescription>
            </CardHeader>
            <CardContent>
              {topItems.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No items billed yet today.
                </p>
              ) : (
                <ol className="space-y-4">
                  {topItems.map((it, i) => {
                    const max = topItems[0].qty || 1;
                    return (
                      <li key={it.name}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="flex min-w-0 items-baseline gap-2.5 text-sm font-medium text-foreground">
                            <span className="w-3 shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                              {i + 1}
                            </span>
                            <span className="truncate">{it.name}</span>
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {it.qty} sold · {inr(it.revenue)}
                          </span>
                        </div>
                        <div className="mt-2 ml-5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${Math.max(6, (it.qty / max) * 100)}%`,
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Menu and channels</CardTitle>
              <CardDescription>
                What&apos;s live on the menu and on delivery platforms.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border">
                <HealthRow
                  icon={Utensils}
                  label="Active menu items"
                  value={String(activeProducts ?? 0)}
                />
                <HealthRow
                  icon={ShoppingBag}
                  label="Sold out or hidden"
                  value={String(inactiveProducts ?? 0)}
                  alert={(inactiveProducts ?? 0) > 0}
                />
                <HealthRow
                  icon={Bike}
                  label="Aggregator links online"
                  value={`${onlineChannels} of ${channels.length}`}
                />
              </dl>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href={`${base}/menu`}
                  className={buttonVariants({
                    variant: "secondary",
                    className: "w-full",
                  })}
                >
                  Manage menu
                </Link>
                <Link
                  href={`${base}/channels`}
                  className={buttonVariants({
                    variant: "secondary",
                    className: "w-full",
                  })}
                >
                  Channels
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function HealthRow({
  icon: Icon,
  label,
  value,
  alert,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-0">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border/70 bg-secondary text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <dt className="min-w-0 flex-1 truncate text-sm">{label}</dt>
      <dd
        className={cn(
          "shrink-0 text-sm tabular-nums",
          alert ? "font-medium text-destructive" : "text-muted-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  current,
  previous,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  current?: number;
  previous?: number;
  hint?: string;
}) {
  let delta: { pct: number; up: boolean } | null = null;
  if (current !== undefined && previous !== undefined && previous > 0) {
    const pct = ((current - previous) / previous) * 100;
    delta = { pct: Math.abs(Math.round(pct)), up: pct >= 0 };
  }
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-muted-foreground">
            {label}
          </span>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
          {value}
        </div>
        <div className="mt-1 min-h-[18px] text-xs">
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-medium",
                delta.up ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {delta.up ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {delta.pct}% vs yesterday
            </span>
          ) : (
            <span className="text-muted-foreground">{hint ?? ""}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
