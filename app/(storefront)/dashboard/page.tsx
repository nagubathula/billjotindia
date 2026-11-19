import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  ChefHat,
  HandPlatter,
  IndianRupee,
  MonitorSmartphone,
  Plus,
  Receipt,
  ReceiptText,
  ShieldCheck,
  Store,
  TrendingDown,
  TrendingUp,
  User as UserIcon,
  UserCog,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser, getUserBrands, getUserRestaurants } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKey, hourOfDay, resolveTimeZone, startOfDay } from "@/lib/time";
import type { AppRole, Brand, Restaurant } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  "7d": "vs prev 7d",
  "30d": "vs prev 30d",
};

const ROLE_ICON: Record<AppRole, React.ComponentType<{ className?: string }>> = {
  admin: ShieldCheck,
  manager: UserCog,
  user: UserIcon,
  captain: HandPlatter,
};

function formatHandle(slug: string, fallbackName: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(slug)) {
    return fallbackName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  return slug;
}

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

const inr = (n: number) =>
  `₹${Math.round(Number.isFinite(n) ? n : 0).toLocaleString("en-IN")}`;

function hourLabel(h: number) {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function isOpenPosTable(source: string, customerEmail: string | null) {
  return (
    source === "pos" &&
    (customerEmail ?? "").toLowerCase().startsWith("pos+open")
  );
}

function pctDelta(cur: number, prev: number): number | null {
  return prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
}

type RestRollup = {
  orders: number;
  revenue: number;
  gst: number;
  liveQueue: number;
  outletsCount: number;
  tabReceivable: number;
  corpReceivable: number;
  vendorPayable: number;
};

type Props = {
  searchParams: Promise<{ range?: string }>;
};

export default async function DashboardPage(props: Props) {
  const [user, query] = await Promise.all([
    getCurrentUser(),
    props.searchParams,
  ]);
  if (!user) redirect("/login?next=/dashboard");

  const rawRange = (query.range ?? "7d") as Range;
  const validRange: Range = ["today", "yesterday", "7d", "30d"].includes(
    rawRange,
  )
    ? rawRange
    : "7d";

  const [restaurants, brandEntries] = await Promise.all([
    getUserRestaurants(),
    getUserBrands(),
  ]);

  const brands = brandEntries.map((b) => b.brand);
  const brandById = new Map<string, Brand>(brands.map((b) => [b.id, b]));
  const countByBrandId = new Map<string, number>(
    brandEntries.map((b) => [b.brand.id, b.restaurantCount]),
  );
  const ownerByBrandId = new Map<string, boolean>(
    brandEntries.map((b) => [b.brand.id, b.isOwner]),
  );

  const admin = createAdminClient();
  const brandIds = brands.map((b) => b.id);
  const brandRestaurantsRes = brandIds.length
    ? await admin
        .from("restaurants")
        .select("*")
        .in("brand_id", brandIds)
        .order("name")
    : { data: [] as Restaurant[] };

  const brandAttachedRestaurants = (brandRestaurantsRes.data ?? []) as Restaurant[];
  const ownOpsRestIds = restaurants
    .filter(({ role }) => role === "admin" || role === "manager")
    .map(({ restaurant }) => restaurant.id);

  const analyticsRestMap = new Map<string, Restaurant>();
  for (const { restaurant, role } of restaurants) {
    if (role === "admin" || role === "manager") {
      analyticsRestMap.set(restaurant.id, restaurant);
    }
  }
  for (const r of brandAttachedRestaurants) {
    analyticsRestMap.set(r.id, r);
  }
  const analyticsRestIds = [...analyticsRestMap.keys()];
  const hasOpsAnalytics = ownOpsRestIds.length > 0 || brandIds.length > 0;

  // Fetch consolidated analytics across authorized restaurants & brands
  const outletsRes = analyticsRestIds.length
    ? await admin
        .from("outlets")
        .select("id, restaurant_id, timezone")
        .in("restaurant_id", analyticsRestIds)
    : { data: [] as Array<{ id: string; restaurant_id: string; timezone: string }> };

  const allOutlets = outletsRes.data ?? [];
  const allOutletIds = allOutlets.map((o) => o.id);
  const timeZone = resolveTimeZone(allOutlets[0]?.timezone);
  const { start, end } = rangeBounds(validRange, timeZone);
  const periodMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - periodMs);

  const [
    ordersRes,
    prevOrdersRes,
    liveQueueRes,
    tabsRes,
    corpInvoicesRes,
    vendorPosRes,
  ] =
    analyticsRestIds.length > 0
      ? await Promise.all([
          allOutletIds.length > 0
            ? admin
                .from("orders")
                .select(
                  "outlet_id, source, status, customer_email, total_amount, cgst_amount, sgst_amount, gst_paid_by_operator, placed_at",
                )
                .in("outlet_id", allOutletIds)
                .gte("placed_at", start.toISOString())
                .lte("placed_at", end.toISOString())
                .neq("status", "cancelled")
            : Promise.resolve({ data: [] }),
          allOutletIds.length > 0
            ? admin
                .from("orders")
                .select("outlet_id, source, customer_email, total_amount")
                .in("outlet_id", allOutletIds)
                .gte("placed_at", prevStart.toISOString())
                .lte("placed_at", prevEnd.toISOString())
                .neq("status", "cancelled")
            : Promise.resolve({ data: [] }),
          allOutletIds.length > 0
            ? admin
                .from("orders")
                .select("outlet_id")
                .in("outlet_id", allOutletIds)
                .in("status", ["pending", "confirmed", "preparing", "ready"])
            : Promise.resolve({ data: [] }),
          admin
            .from("customer_tabs")
            .select("restaurant_id, current_balance, status")
            .in("restaurant_id", analyticsRestIds),
          admin
            .from("corporate_invoices")
            .select("restaurant_id, total_amount, amount_paid, status")
            .in("restaurant_id", analyticsRestIds)
            .neq("status", "cancelled"),
          admin
            .from("vendor_purchase_orders")
            .select("restaurant_id, total_amount, amount_paid, status")
            .in("restaurant_id", analyticsRestIds)
            .neq("status", "cancelled"),
        ])
      : [
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
        ];

  const outletToRest = new Map<string, string>(
    allOutlets.map((o) => [o.id, o.restaurant_id]),
  );

  const rollupByRest = new Map<string, RestRollup>();
  const ensureRollup = (rid: string): RestRollup => {
    const existing = rollupByRest.get(rid);
    if (existing) return existing;
    const blank: RestRollup = {
      orders: 0,
      revenue: 0,
      gst: 0,
      liveQueue: 0,
      outletsCount: 0,
      tabReceivable: 0,
      corpReceivable: 0,
      vendorPayable: 0,
    };
    rollupByRest.set(rid, blank);
    return blank;
  };

  for (const rid of analyticsRestIds) ensureRollup(rid);
  for (const out of allOutlets) {
    ensureRollup(out.restaurant_id).outletsCount += 1;
  }

  for (const q of liveQueueRes.data ?? []) {
    const rid = outletToRest.get(q.outlet_id);
    if (rid) ensureRollup(rid).liveQueue += 1;
  }

  for (const t of tabsRes.data ?? []) {
    if (t.status === "active") {
      ensureRollup(t.restaurant_id).tabReceivable += Math.max(
        0,
        Number(t.current_balance ?? 0),
      );
    }
  }

  for (const inv of corpInvoicesRes.data ?? []) {
    const due = Math.max(
      0,
      Number(inv.total_amount ?? 0) - Number(inv.amount_paid ?? 0),
    );
    ensureRollup(inv.restaurant_id).corpReceivable += due;
  }

  for (const po of vendorPosRes.data ?? []) {
    const due = Math.max(
      0,
      Number(po.total_amount ?? 0) - Number(po.amount_paid ?? 0),
    );
    ensureRollup(po.restaurant_id).vendorPayable += due;
  }

  type BrandBucket = {
    orders: number;
    revenue: number;
    prevOrders: number;
    prevRevenue: number;
    gst: number;
    liveQueue: number;
    outletsCount: number;
    tabReceivable: number;
    corpReceivable: number;
    vendorPayable: number;
    sourceTotals: Map<string, { count: number; revenue: number }>;
    settled: Array<{ placed_at: string; total_amount: number }>;
    restaurants: Restaurant[];
  };

  const brandBuckets = new Map<string, BrandBucket>();
  for (const b of brands) {
    const attached = brandAttachedRestaurants.filter((r) => r.brand_id === b.id);
    brandBuckets.set(b.id, {
      orders: 0,
      revenue: 0,
      prevOrders: 0,
      prevRevenue: 0,
      gst: 0,
      liveQueue: 0,
      outletsCount: attached.reduce(
        (s, r) => s + ensureRollup(r.id).outletsCount,
        0,
      ),
      tabReceivable: attached.reduce(
        (s, r) => s + ensureRollup(r.id).tabReceivable,
        0,
      ),
      corpReceivable: attached.reduce(
        (s, r) => s + ensureRollup(r.id).corpReceivable,
        0,
      ),
      vendorPayable: attached.reduce(
        (s, r) => s + ensureRollup(r.id).vendorPayable,
        0,
      ),
      sourceTotals: new Map(),
      settled: [],
      restaurants: attached,
    });
  }

  let portfolioOrders = 0;
  let portfolioRevenue = 0;
  let portfolioPrevRevenue = 0;
  let portfolioGst = 0;

  const isHourly = validRange === "today" || validRange === "yesterday";

  for (const raw of ordersRes.data ?? []) {
    if (isOpenPosTable(raw.source, raw.customer_email)) continue;
    const rid = outletToRest.get(raw.outlet_id);
    if (!rid) continue;

    const amt = Number(raw.total_amount ?? 0);
    const gst = raw.gst_paid_by_operator
      ? 0
      : Number(raw.cgst_amount ?? 0) + Number(raw.sgst_amount ?? 0);

    const st = ensureRollup(rid);
    st.orders += 1;
    st.revenue += amt;
    st.gst += gst;

    portfolioOrders += 1;
    portfolioRevenue += amt;
    portfolioGst += gst;

    const restObj = analyticsRestMap.get(rid);
    const bid = restObj?.brand_id;
    if (bid && brandBuckets.has(bid)) {
      const bb = brandBuckets.get(bid)!;
      bb.orders += 1;
      bb.revenue += amt;
      bb.gst += gst;
      bb.settled.push({ placed_at: raw.placed_at, total_amount: amt });
      const src = bb.sourceTotals.get(raw.source) ?? { count: 0, revenue: 0 };
      src.count += 1;
      src.revenue += amt;
      bb.sourceTotals.set(raw.source, src);
    }
  }

  for (const raw of prevOrdersRes.data ?? []) {
    if (isOpenPosTable(raw.source, raw.customer_email)) continue;
    const rid = outletToRest.get(raw.outlet_id);
    if (!rid) continue;
    const amt = Number(raw.total_amount ?? 0);
    portfolioPrevRevenue += amt;

    const restObj = analyticsRestMap.get(rid);
    const bid = restObj?.brand_id;
    if (bid && brandBuckets.has(bid)) {
      const bb = brandBuckets.get(bid)!;
      bb.prevOrders += 1;
      bb.prevRevenue += amt;
    }
  }

  for (const [bid, bb] of brandBuckets.entries()) {
    void bid;
    bb.liveQueue = bb.restaurants.reduce(
      (s, r) => s + ensureRollup(r.id).liveQueue,
      0,
    );
  }

  const portfolioReceivables = analyticsRestIds.reduce(
    (s, rid) =>
      s + ensureRollup(rid).corpReceivable + ensureRollup(rid).tabReceivable,
    0,
  );
  const portfolioPayables = analyticsRestIds.reduce(
    (s, rid) => s + ensureRollup(rid).vendorPayable,
    0,
  );
  const portfolioLiveKds = analyticsRestIds.reduce(
    (s, rid) => s + ensureRollup(rid).liveQueue,
    0,
  );

  const buildSeries = (settled: Array<{ placed_at: string; total_amount: number }>) => {
    const out: { label: string; value: number }[] = [];
    if (isHourly) {
      const map = new Map<number, number>();
      for (let h = 7; h <= 23; h++) map.set(h, 0);
      for (const o of settled) {
        const h = hourOfDay(new Date(o.placed_at), timeZone);
        if (!map.has(h)) map.set(h, 0);
        map.set(h, (map.get(h) ?? 0) + o.total_amount);
      }
      [...map.entries()]
        .sort((a, b) => a[0] - b[0])
        .forEach(([h, v]) => out.push({ label: hourLabel(h), value: v }));
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
      for (const o of settled) {
        const key = dayKey(new Date(o.placed_at), timeZone);
        const bucket = map.get(key);
        if (bucket) bucket.value += o.total_amount;
      }
      out.push(...map.values());
    }
    return out;
  };

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "there";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${displayName.split(" ")[0]}`}
        description="Consolidated brand & restaurant performance, receivables, and POS launchers."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {hasOpsAnalytics && (
              <nav className="inline-flex items-center rounded-[10px] bg-muted p-0.5">
                {(["today", "yesterday", "7d", "30d"] as const).map((r) => (
                  <Link
                    key={r}
                    href={`/dashboard?range=${r}`}
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
            )}
            <Link
              href="/brands/new"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Plus className="h-3.5 w-3.5" />
              New brand
            </Link>
            <Link
              href="/signup"
              className={cn(buttonVariants({ variant: "default", size: "sm" }))}
            >
              <Plus className="h-3.5 w-3.5" />
              New restaurant
            </Link>
          </div>
        }
      />

      {/* Executive Portfolio KPI Strip */}
      {hasOpsAnalytics ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label={`Portfolio Revenue (${RANGE_LABEL[validRange]})`}
            value={inr(portfolioRevenue)}
            sub={`${restaurants.length} restaurants · ${allOutlets.length} outlets`}
            deltaPct={pctDelta(portfolioRevenue, portfolioPrevRevenue)}
            deltaLabel={PREV_LABEL[validRange]}
            icon={IndianRupee}
          />
          <StatCard
            label="Settled Orders"
            value={portfolioOrders}
            sub={
              portfolioOrders > 0
                ? `Avg ${inr(portfolioRevenue / portfolioOrders)} / order`
                : `No orders in ${RANGE_LABEL[validRange].toLowerCase()}`
            }
            icon={ReceiptText}
          />
          <StatCard
            label="GST Collected"
            value={inr(portfolioGst)}
            sub={`CGST ${inr(portfolioGst / 2)} · SGST ${inr(portfolioGst / 2)}`}
            icon={Receipt}
          />
          <StatCard
            label="Receivables (B2B + Khata)"
            value={inr(portfolioReceivables)}
            sub="Unpaid corporate invoices & customer tabs"
            icon={Wallet}
          />
          <StatCard
            label="Vendor Payables & KDS"
            value={inr(portfolioPayables)}
            sub={`${portfolioLiveKds} active orders in kitchen`}
            icon={ChefHat}
          />
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Active Restaurants"
            value={restaurants.length}
            sub="Operational POS & Storefront"
            icon={Store}
          />
          <StatCard
            label="Franchise Brands"
            value={brands.length}
            sub="Multi-restaurant groups"
            icon={Building2}
          />
          <StatCard
            label="Access Level"
            value={
              restaurants.some((r) => r.role === "user")
                ? "Cashier"
                : restaurants.some((r) => r.role === "captain")
                  ? "Captain"
                  : "—"
            }
            sub="POS & Floor operations"
            icon={ShieldCheck}
          />
        </section>
      )}

      {/* Franchise Brand Analytics Section */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Brand Analytics
            </h2>
            <p className="text-xs text-muted-foreground">
              Consolidated roll-up performance across multi-restaurant brands (
              {RANGE_LABEL[validRange]}).
            </p>
          </div>
        </div>

        {brands.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Building2}
                title="No brands yet"
                description="Group multiple outlets/restaurants into a franchise brand to view side-by-side revenue analytics."
                action={
                  <Link
                    href="/brands/new"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                    )}
                  >
                    Create a brand
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {brands.map((b) => {
              const bb = brandBuckets.get(b.id);
              const count = countByBrandId.get(b.id) ?? 0;
              const isOwner = ownerByBrandId.get(b.id) ?? false;
              const brandAov = bb && bb.orders > 0 ? bb.revenue / bb.orders : 0;
              const brandDelta = bb
                ? pctDelta(bb.revenue, bb.prevRevenue)
                : null;
              const series = bb ? buildSeries(bb.settled) : [];
              const seriesMax = Math.max(...series.map((s) => s.value), 1);
              const labelEvery = Math.max(1, Math.ceil(series.length / 8));
              const ranked = [...(bb?.restaurants ?? [])].sort(
                (a, c) =>
                  ensureRollup(c.id).revenue - ensureRollup(a.id).revenue,
              );
              const sources = [...(bb?.sourceTotals.entries() ?? [])].sort(
                (a, c) => c[1].revenue - a[1].revenue,
              );

              return (
                <Card key={b.id}>
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-base font-semibold">
                            {b.name}
                          </CardTitle>
                          <Badge variant="outline" className="text-[11px]">
                            {isOwner ? "Owner" : "Franchise Admin"}
                          </Badge>
                          <Badge variant="secondary" className="text-[11px]">
                            {count} {count === 1 ? "restaurant" : "restaurants"} ·{" "}
                            {bb?.outletsCount ?? 0} outlets
                          </Badge>
                        </div>
                        <CardDescription className="mt-0.5 font-mono text-[11px]">
                          /brands/{formatHandle(b.slug, b.name)}
                        </CardDescription>
                      </div>
                    </div>

                    <Link
                      href={`/brands/${b.slug}?range=${validRange}`}
                      className={cn(
                        buttonVariants({ variant: "default", size: "sm" }),
                      )}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      Open Full Brand HQ
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </CardHeader>

                  <CardContent className="space-y-5 pt-4">
                    {/* 6-Metric Brand Financial Strip */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      <MiniMetric
                        label="Brand Revenue"
                        value={inr(bb?.revenue ?? 0)}
                        deltaPct={brandDelta}
                        deltaLabel={PREV_LABEL[validRange]}
                      />
                      <MiniMetric
                        label="Settled Orders"
                        value={String(bb?.orders ?? 0)}
                        sub={`${bb?.liveQueue ?? 0} live in KDS`}
                      />
                      <MiniMetric
                        label="Avg Order Value"
                        value={bb && bb.orders > 0 ? inr(brandAov) : "—"}
                        sub={RANGE_LABEL[validRange]}
                      />
                      <MiniMetric
                        label="Brand GST"
                        value={inr(bb?.gst ?? 0)}
                        sub={`CGST + SGST`}
                      />
                      <MiniMetric
                        label="B2B & Khata Due"
                        value={inr(
                          (bb?.corpReceivable ?? 0) + (bb?.tabReceivable ?? 0),
                        )}
                        sub={`B2B ${inr(bb?.corpReceivable ?? 0)}`}
                      />
                      <MiniMetric
                        label="Vendor Payables"
                        value={inr(bb?.vendorPayable ?? 0)}
                        sub="Unpaid supplier POs"
                      />
                    </div>

                    {/* Visual Breakdown: Trend + Restaurant Split */}
                    <div className="grid gap-4 lg:grid-cols-12">
                      <div className="rounded-xl border border-border/70 bg-muted/15 p-3.5 lg:col-span-7">
                        <div className="mb-3 flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground">
                            Revenue trend ({isHourly ? "Hourly" : "Daily"})
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {RANGE_LABEL[validRange]}
                          </span>
                        </div>
                        {bb && bb.orders > 0 ? (
                          <div>
                            <div className="flex h-28 items-end gap-1">
                              {series.map((s, idx) => (
                                <div
                                  key={idx}
                                  className="group flex h-full flex-1 items-end"
                                  title={`${s.label}: ${inr(s.value)}`}
                                >
                                  <div
                                    className="w-full rounded-t bg-primary/85 transition-all group-hover:bg-primary"
                                    style={{
                                      height: `${Math.max(
                                        (s.value / seriesMax) * 100,
                                        s.value > 0 ? 5 : 2,
                                      )}%`,
                                      opacity: s.value > 0 ? 1 : 0.15,
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="mt-1.5 flex gap-1">
                              {series.map((s, idx) => (
                                <div
                                  key={idx}
                                  className="flex-1 truncate text-center text-[10px] tabular-nums text-muted-foreground"
                                >
                                  {idx % labelEvery === 0 ? s.label : ""}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
                            No settled orders in {RANGE_LABEL[validRange].toLowerCase()}.
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col justify-between gap-3 rounded-xl border border-border/70 bg-muted/15 p-3.5 lg:col-span-5">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-foreground">
                              Restaurant revenue share
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {ranked.length} locations
                            </span>
                          </div>
                          {ranked.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No restaurants attached to this brand.
                            </p>
                          ) : (
                            <div className="space-y-2.5">
                              {ranked.map((r) => {
                                const st = ensureRollup(r.id);
                                const share =
                                  bb && bb.revenue > 0
                                    ? Math.round((st.revenue / bb.revenue) * 100)
                                    : 0;
                                return (
                                  <div key={r.id} className="space-y-1 text-xs">
                                    <div className="flex items-center justify-between gap-2">
                                      <Link
                                        href={`/r/${r.slug}/admin/reports?range=${validRange}`}
                                        className="truncate font-medium text-foreground hover:underline"
                                      >
                                        {r.name}
                                      </Link>
                                      <span className="shrink-0 tabular-nums text-muted-foreground">
                                        {st.orders} ·{" "}
                                        <span className="font-semibold text-foreground">
                                          {inr(st.revenue)}
                                        </span>{" "}
                                        ({share}%)
                                      </span>
                                    </div>
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                      <div
                                        className="h-full rounded-full bg-primary/85"
                                        style={{ width: `${share}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {sources.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
                            <span className="text-[11px] text-muted-foreground">
                              Channels:
                            </span>
                            {sources.map(([src, val]) => (
                              <Badge
                                key={src}
                                variant="outline"
                                className="text-[10px] uppercase tabular-nums"
                              >
                                {src} · {inr(val.revenue)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Restaurants Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Restaurants
            </h2>
            <p className="text-xs text-muted-foreground">
              Launch admin portals, counter POS billing, GST reports, or online storefronts.
            </p>
          </div>
        </div>

        {restaurants.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Store}
                title="No restaurants yet"
                description="Create your first restaurant — it becomes yours, and you become the admin."
                action={
                  <Link
                    href="/signup"
                    className={cn(
                      buttonVariants({ variant: "default", size: "sm" }),
                    )}
                  >
                    Create your first restaurant
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map(({ restaurant: r, role }) => {
              const RoleIcon = ROLE_ICON[role];
              const isOps = role === "admin" || role === "manager";
              const parentBrand = r.brand_id
                ? brandById.get(r.brand_id)
                : undefined;
              const st = isOps ? ensureRollup(r.id) : null;

              return (
                <Card key={r.id} className="justify-between">
                  <CardHeader className="space-y-2.5 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
                        <Store className="h-4 w-4" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {parentBrand ? (
                          <Badge variant="outline" className="text-[11px]">
                            {parentBrand.name}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[11px]">
                            Independent
                          </Badge>
                        )}
                        <Badge variant="secondary" className="gap-1 text-[11px]">
                          <RoleIcon className="h-3 w-3" />
                          {ROLE_LABEL[role]}
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <CardTitle className="text-base font-semibold leading-snug">
                        {r.name}
                      </CardTitle>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        /{formatHandle(r.slug, r.name)}
                      </p>
                    </div>

                    {st && (
                      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2 text-[11px]">
                        <div>
                          <div className="text-muted-foreground">Revenue</div>
                          <div className="font-semibold tabular-nums">
                            {inr(st.revenue)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Orders</div>
                          <div className="font-semibold tabular-nums">
                            {st.orders}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Live KDS</div>
                          <div className="font-semibold tabular-nums">
                            {st.liveQueue}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardHeader>

                  <CardFooter className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={
                          isOps ? `/r/${r.slug}/admin` : `/r/${r.slug}/pos`
                        }
                        className={cn(
                          buttonVariants({ variant: "default", size: "sm" }),
                        )}
                      >
                        {isOps ? "Admin Portal" : "Open POS"}
                      </Link>
                      {isOps && (
                        <Link
                          href={`/r/${r.slug}/pos`}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                          )}
                        >
                          <MonitorSmartphone className="h-3.5 w-3.5" />
                          POS
                        </Link>
                      )}
                      {isOps && (
                        <Link
                          href={`/r/${r.slug}/admin/reports?range=${validRange}`}
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                          )}
                          title="Open GST & sales reports"
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                    <Link
                      href={`/r/${r.slug}`}
                      target="_blank"
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Storefront
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  deltaPct,
  deltaLabel,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  sub: string;
  deltaPct?: number | null;
  deltaLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <Card size="sm">
      <CardContent className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{label}</span>
          <Icon className="h-3.5 w-3.5 shrink-0" />
        </div>
        <div className="text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </div>
        <div className="text-[11px] text-muted-foreground">
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
              <span>{deltaLabel}</span>
            </span>
          ) : (
            sub
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniMetric({
  label,
  value,
  sub,
  deltaPct,
  deltaLabel,
}: {
  label: string;
  value: string;
  sub?: string;
  deltaPct?: number | null;
  deltaLabel?: string;
}) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-bold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
        {deltaPct !== null && deltaPct !== undefined ? (
          <span
            className={cn(
              "font-medium",
              up ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {up ? "+" : ""}
            {deltaPct}% {deltaLabel}
          </span>
        ) : (
          sub ?? ""
        )}
      </div>
    </div>
  );
}
