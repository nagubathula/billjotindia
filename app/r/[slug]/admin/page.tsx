// Admin home: a live operational snapshot for the restaurant. Where Reports
// answers "how did we do over a period", this page answers "what needs my
// attention right now" — today's numbers so far, the open-order queue, what's
// selling, and menu health — with one-click jumps into the relevant section.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  ChefHat,
  Clock,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import type { Order, OrderItem, ProductConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const OPEN_STATUSES = ["pending", "confirmed", "preparing", "ready"] as const;

const QUEUE_META: Record<
  (typeof OPEN_STATUSES)[number],
  { label: string; tone: string }
> = {
  pending: { label: "New", tone: "bg-amber-500" },
  confirmed: { label: "Accepted", tone: "bg-sky-500" },
  preparing: { label: "Preparing", tone: "bg-violet-500" },
  ready: { label: "Ready", tone: "bg-emerald-500" },
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function minutesAgo(iso: string | null, now: number) {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

type Props = { params: { slug: string } };

export default async function AdminOverviewPage({ params }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);
  const scoped = outletIds.length > 0 ? outletIds : [NIL_UUID];

  // "Today so far" vs "yesterday up to the same time" keeps the delta honest
  // in the morning, when a full yesterday would always look better.
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdaySameTime = new Date(now);
  yesterdaySameTime.setDate(yesterdaySameTime.getDate() - 1);

  const supabase = createClient();
  const [
    { data: todayData },
    { data: yesterdayData },
    { data: openData },
    { count: activeProducts },
    { count: inactiveProducts },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total_amount, status, placed_at")
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
  ]);

  const today = (todayData ?? []) as Pick<Order, "id" | "total_amount" | "status" | "placed_at">[];
  const openOrders = (openData ?? []) as Order[];

  const revenue = today.reduce((s, o) => s + Number(o.total_amount), 0);
  const prevRevenue = (yesterdayData ?? []).reduce((s, o) => s + Number(o.total_amount), 0);
  const orderCount = today.length;
  const prevCount = yesterdayData?.length ?? 0;
  const aov = orderCount > 0 ? revenue / orderCount : 0;

  const queueCounts = Object.fromEntries(
    OPEN_STATUSES.map((s) => [s, openOrders.filter((o) => o.status === s).length]),
  ) as Record<(typeof OPEN_STATUSES)[number], number>;

  // Top sellers today, by quantity.
  let topItems: { name: string; qty: number; revenue: number }[] = [];
  if (today.length > 0) {
    const { data: itemData } = await supabase
      .from("order_items")
      .select("product_config, quantity, total_price")
      .in("order_id", today.map((o) => o.id));
    const byName = new Map<string, { qty: number; revenue: number }>();
    for (const it of (itemData ?? []) as Pick<OrderItem, "product_config" | "quantity" | "total_price">[]) {
      const name = (it.product_config as unknown as ProductConfig)?.name ?? "Item";
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
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`${restaurant.name} · ${dateLabel}`}
        actions={
          <>
            <Link href={`${base}/kitchen`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ChefHat className="mr-1.5 h-4 w-4" /> Kitchen
              </Link>
            <Link href={`/r/${restaurant.slug}/pos`} className={buttonVariants({ variant: "default", size: "sm" })}>
                <MonitorSmartphone className="mr-1.5 h-4 w-4" /> Open POS
              </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={IndianRupee}
          label="Sales today"
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
        <StatCard icon={BarChart3} label="Avg order value" value={inr(aov)} />
        <StatCard
          icon={Clock}
          label="Open orders"
          value={String(openOrders.length)}
          hint={openOrders.length > 0 ? "Across all outlets" : "Queue is clear"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Live queue</CardTitle>
              <CardDescription>Oldest first — these are waiting on you.</CardDescription>
            </div>
            <Link href={`${base}/orders`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                All orders <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {OPEN_STATUSES.map((s) => (
                <div key={s} className="rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", QUEUE_META[s].tone)} />
                    {QUEUE_META[s].label}
                  </div>
                  <div className="mt-0.5 text-xl font-semibold tabular-nums">
                    {queueCounts[s]}
                  </div>
                </div>
              ))}
            </div>

            {openOrders.length === 0 ? (
              <EmptyState
                icon={ListOrdered}
                title="No open orders"
                description="New orders from the POS and online storefront land here."
              />
            ) : (
              <ul className="divide-y rounded-lg border">
                {openOrders.slice(0, 8).map((o) => {
                  const s = (o.status ?? "pending") as (typeof OPEN_STATUSES)[number];
                  return (
                    <li key={o.id}>
                      <Link
                        href={`${base}/orders/${o.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-muted/50"
                      >
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", QUEUE_META[s]?.tone ?? "bg-muted")} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {o.customer_name || "Walk-in"}
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {o.token_number ? `#${o.token_number}` : o.unique_order_id}
                            </span>
                          </div>
                          <div className="text-xs capitalize text-muted-foreground">
                            {QUEUE_META[s]?.label ?? s} · {o.order_type ?? "order"} · {o.source}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold tabular-nums">{inr(Number(o.total_amount))}</div>
                          <div className="text-xs text-muted-foreground">
                            {minutesAgo(o.placed_at, nowMs)}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top sellers today</CardTitle>
              <CardDescription>By quantity sold.</CardDescription>
            </CardHeader>
            <CardContent>
              {topItems.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing sold yet today.
                </p>
              ) : (
                <ol className="space-y-2.5">
                  {topItems.map((it, i) => {
                    const max = topItems[0].qty || 1;
                    return (
                      <li key={it.name} className="text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            <span className="mr-2 text-xs text-muted-foreground">{i + 1}</span>
                            {it.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {it.qty} · {inr(it.revenue)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(6, (it.qty / max) * 100)}%` }}
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
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Menu health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Utensils className="h-4 w-4" /> Live items
                </span>
                <span className="font-semibold tabular-nums">{activeProducts ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <ShoppingBag className="h-4 w-4" /> Hidden / sold out
                </span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    (inactiveProducts ?? 0) > 0 && "text-amber-600",
                  )}
                >
                  {inactiveProducts ?? 0}
                </span>
              </div>
              <Link href={`${base}/menu`} className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}>Manage menu</Link>
              <Link href={`${base}/reports`} className={buttonVariants({ variant: "ghost", size: "sm", className: "w-full" })}>
                  <BarChart3 className="mr-1.5 h-4 w-4" /> Detailed reports
                </Link>
            </CardContent>
          </Card>
        </div>
      </div>
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
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {label}
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        <div className="mt-1 h-4 text-xs">
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                delta.up ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {delta.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {delta.pct}% vs this time yesterday
            </span>
          ) : (
            <span className="text-muted-foreground">{hint ?? ""}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
