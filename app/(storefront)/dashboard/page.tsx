import { redirect } from "next/navigation";
import { getCurrentUser, getUserBrands, getUserRestaurants } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKey, hourOfDay, resolveTimeZone, startOfDay } from "@/lib/time";
import type { Brand, Restaurant } from "@/lib/types";
import {
  DashboardView,
  type AnalyticsRange,
  type DashboardBrandAnalytics,
  type DashboardRangeSnapshot,
} from "./DashboardView";

export const dynamic = "force-dynamic";

const ALL_RANGES: readonly AnalyticsRange[] = [
  "today",
  "yesterday",
  "7d",
  "30d",
];

function formatHandle(slug: string, fallbackName: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(slug)) {
    return fallbackName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  return slug;
}

function rangeBounds(
  r: AnalyticsRange,
  now: Date,
  timeZone: string,
): { start: Date; end: Date } {
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

type Props = {
  searchParams: Promise<{ range?: string }>;
};

export default async function DashboardPage(props: Props) {
  const [user, query] = await Promise.all([
    getCurrentUser(),
    props.searchParams,
  ]);
  if (!user) redirect("/login?next=/dashboard");

  const rawRange = (query.range ?? "7d") as AnalyticsRange;
  const initialRange: AnalyticsRange = (
    ALL_RANGES as readonly string[]
  ).includes(rawRange)
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

  const outletsRes = analyticsRestIds.length
    ? await admin
        .from("outlets")
        .select("id, restaurant_id, timezone")
        .in("restaurant_id", analyticsRestIds)
    : {
        data: [] as Array<{
          id: string;
          restaurant_id: string;
          timezone: string;
        }>,
      };

  const allOutlets = outletsRes.data ?? [];
  const allOutletIds = allOutlets.map((o) => o.id);
  const timeZone = resolveTimeZone(allOutlets[0]?.timezone);
  const now = new Date();
  const window60Start = startOfDay(now, timeZone, -59);

  const [
    ordersRes,
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
                .gte("placed_at", window60Start.toISOString())
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
        ];

  const outletToRest = new Map<string, string>(
    allOutlets.map((o) => [o.id, o.restaurant_id]),
  );

  const outletsCountByRest = new Map<string, number>();
  for (const out of allOutlets) {
    outletsCountByRest.set(
      out.restaurant_id,
      (outletsCountByRest.get(out.restaurant_id) ?? 0) + 1,
    );
  }

  const liveQueueByRest = new Map<string, number>();
  for (const q of liveQueueRes.data ?? []) {
    const rid = outletToRest.get(q.outlet_id);
    if (rid) liveQueueByRest.set(rid, (liveQueueByRest.get(rid) ?? 0) + 1);
  }

  const tabRecByRest = new Map<string, number>();
  for (const t of tabsRes.data ?? []) {
    if (t.status === "active") {
      tabRecByRest.set(
        t.restaurant_id,
        (tabRecByRest.get(t.restaurant_id) ?? 0) +
          Math.max(0, Number(t.current_balance ?? 0)),
      );
    }
  }

  const corpRecByRest = new Map<string, number>();
  for (const inv of corpInvoicesRes.data ?? []) {
    const due = Math.max(
      0,
      Number(inv.total_amount ?? 0) - Number(inv.amount_paid ?? 0),
    );
    corpRecByRest.set(
      inv.restaurant_id,
      (corpRecByRest.get(inv.restaurant_id) ?? 0) + due,
    );
  }

  const vendorPayByRest = new Map<string, number>();
  for (const po of vendorPosRes.data ?? []) {
    const due = Math.max(
      0,
      Number(po.total_amount ?? 0) - Number(po.amount_paid ?? 0),
    );
    vendorPayByRest.set(
      po.restaurant_id,
      (vendorPayByRest.get(po.restaurant_id) ?? 0) + due,
    );
  }

  const settledOrders = (ordersRes.data ?? [])
    .filter((o) => !isOpenPosTable(o.source, o.customer_email))
    .map((raw) => ({
      rid: outletToRest.get(raw.outlet_id) ?? "",
      source: raw.source,
      amt: Number(raw.total_amount ?? 0),
      gst: raw.gst_paid_by_operator
        ? 0
        : Number(raw.cgst_amount ?? 0) + Number(raw.sgst_amount ?? 0),
      placedAtMs: new Date(raw.placed_at).getTime(),
      placedAtIso: raw.placed_at,
    }))
    .filter((o) => Boolean(o.rid));

  const buildSnapshot = (rKey: AnalyticsRange): DashboardRangeSnapshot => {
    const { start, end } = rangeBounds(rKey, now, timeZone);
    const startMs = start.getTime();
    const endMs = end.getTime();
    const periodMs = endMs - startMs;
    const prevEndMs = startMs - 1;
    const prevStartMs = prevEndMs - periodMs;
    const isHourly = rKey === "today" || rKey === "yesterday";

    const restOrders = new Map<string, number>();
    const restRevenue = new Map<string, number>();

    let portfolioOrders = 0;
    let portfolioRevenue = 0;
    let portfolioPrevRevenue = 0;
    let portfolioGst = 0;

    type MutableBrand = {
      orders: number;
      revenue: number;
      prevOrders: number;
      prevRevenue: number;
      gst: number;
      sourceTotals: Map<string, { count: number; revenue: number }>;
      settled: Array<{ placed_at: string; total_amount: number }>;
    };
    const brandMap = new Map<string, MutableBrand>();
    for (const b of brands) {
      brandMap.set(b.id, {
        orders: 0,
        revenue: 0,
        prevOrders: 0,
        prevRevenue: 0,
        gst: 0,
        sourceTotals: new Map(),
        settled: [],
      });
    }

    for (const o of settledOrders) {
      const restObj = analyticsRestMap.get(o.rid);
      const bid = restObj?.brand_id;

      if (o.placedAtMs >= startMs && o.placedAtMs <= endMs) {
        portfolioOrders += 1;
        portfolioRevenue += o.amt;
        portfolioGst += o.gst;

        restOrders.set(o.rid, (restOrders.get(o.rid) ?? 0) + 1);
        restRevenue.set(o.rid, (restRevenue.get(o.rid) ?? 0) + o.amt);

        if (bid && brandMap.has(bid)) {
          const bb = brandMap.get(bid)!;
          bb.orders += 1;
          bb.revenue += o.amt;
          bb.gst += o.gst;
          bb.settled.push({ placed_at: o.placedAtIso, total_amount: o.amt });
          const src = bb.sourceTotals.get(o.source) ?? { count: 0, revenue: 0 };
          src.count += 1;
          src.revenue += o.amt;
          bb.sourceTotals.set(o.source, src);
        }
      } else if (o.placedAtMs >= prevStartMs && o.placedAtMs <= prevEndMs) {
        portfolioPrevRevenue += o.amt;
        if (bid && brandMap.has(bid)) {
          const bb = brandMap.get(bid)!;
          bb.prevOrders += 1;
          bb.prevRevenue += o.amt;
        }
      }
    }

    const brandSnapshots: DashboardBrandAnalytics[] = brands.map((b) => {
      const bb = brandMap.get(b.id)!;
      const attached = brandAttachedRestaurants.filter(
        (r) => r.brand_id === b.id,
      );
      const series: { label: string; value: number }[] = [];
      if (isHourly) {
        const map = new Map<number, number>();
        for (let h = 7; h <= 23; h++) map.set(h, 0);
        for (const ord of bb.settled) {
          const h = hourOfDay(new Date(ord.placed_at), timeZone);
          if (!map.has(h)) map.set(h, 0);
          map.set(h, (map.get(h) ?? 0) + ord.total_amount);
        }
        [...map.entries()]
          .sort((a, c) => a[0] - c[0])
          .forEach(([h, v]) => series.push({ label: hourLabel(h), value: v }));
      } else {
        const days = rKey === "7d" ? 7 : 30;
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
        for (const ord of bb.settled) {
          const k = dayKey(new Date(ord.placed_at), timeZone);
          const bucket = map.get(k);
          if (bucket) bucket.value += ord.total_amount;
        }
        series.push(...map.values());
      }

      const rankedRestaurants = [...attached]
        .sort(
          (a, c) => (restRevenue.get(c.id) ?? 0) - (restRevenue.get(a.id) ?? 0),
        )
        .map((r) => {
          const rev = restRevenue.get(r.id) ?? 0;
          return {
            id: r.id,
            name: r.name,
            slug: r.slug,
            orders: restOrders.get(r.id) ?? 0,
            revenue: rev,
            sharePct:
              bb.revenue > 0 ? Math.round((rev / bb.revenue) * 100) : 0,
          };
        });

      const sources = [...bb.sourceTotals.entries()]
        .sort((a, c) => c[1].revenue - a[1].revenue)
        .map(([source, v]) => ({ source, count: v.count, revenue: v.revenue }));

      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        handle: formatHandle(b.slug, b.name),
        isOwner: ownerByBrandId.get(b.id) ?? false,
        restaurantCount: countByBrandId.get(b.id) ?? attached.length,
        outletsCount: attached.reduce(
          (s, r) => s + (outletsCountByRest.get(r.id) ?? 0),
          0,
        ),
        orders: bb.orders,
        revenue: bb.revenue,
        prevOrders: bb.prevOrders,
        prevRevenue: bb.prevRevenue,
        gst: bb.gst,
        liveQueue: attached.reduce(
          (s, r) => s + (liveQueueByRest.get(r.id) ?? 0),
          0,
        ),
        corpReceivable: attached.reduce(
          (s, r) => s + (corpRecByRest.get(r.id) ?? 0),
          0,
        ),
        tabReceivable: attached.reduce(
          (s, r) => s + (tabRecByRest.get(r.id) ?? 0),
          0,
        ),
        vendorPayable: attached.reduce(
          (s, r) => s + (vendorPayByRest.get(r.id) ?? 0),
          0,
        ),
        series,
        isHourly,
        rankedRestaurants,
        sources,
      };
    });

    const restaurantCards = restaurants.map(({ restaurant: r, role }) => {
      const isOps = role === "admin" || role === "manager";
      const parentBrand = r.brand_id ? brandById.get(r.brand_id) : undefined;
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        handle: formatHandle(r.slug, r.name),
        role,
        isOps,
        parentBrandName: parentBrand?.name ?? null,
        orders: isOps ? (restOrders.get(r.id) ?? 0) : 0,
        revenue: isOps ? (restRevenue.get(r.id) ?? 0) : 0,
        liveQueue: isOps ? (liveQueueByRest.get(r.id) ?? 0) : 0,
      };
    });

    return {
      portfolioOrders,
      portfolioRevenue,
      portfolioPrevRevenue,
      portfolioGst,
      brands: brandSnapshots,
      restaurants: restaurantCards,
    };
  };

  const ranges: Record<AnalyticsRange, DashboardRangeSnapshot> = {
    today: buildSnapshot("today"),
    yesterday: buildSnapshot("yesterday"),
    "7d": buildSnapshot("7d"),
    "30d": buildSnapshot("30d"),
  };

  const portfolioReceivables = analyticsRestIds.reduce(
    (s, rid) =>
      s + (corpRecByRest.get(rid) ?? 0) + (tabRecByRest.get(rid) ?? 0),
    0,
  );
  const portfolioPayables = analyticsRestIds.reduce(
    (s, rid) => s + (vendorPayByRest.get(rid) ?? 0),
    0,
  );
  const portfolioLiveKds = analyticsRestIds.reduce(
    (s, rid) => s + (liveQueueByRest.get(rid) ?? 0),
    0,
  );

  const accessLevelLabel = restaurants.some((r) => r.role === "admin")
    ? "Admin"
    : restaurants.some((r) => r.role === "manager")
      ? "Manager"
      : restaurants.some((r) => r.role === "user")
        ? "Cashier"
        : restaurants.some((r) => r.role === "captain")
          ? "Captain"
          : "—";

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "there";

  return (
    <DashboardView
      firstName={displayName.split(" ")[0]}
      initialRange={initialRange}
      hasOpsAnalytics={hasOpsAnalytics}
      outletsCount={allOutlets.length}
      restaurantsCount={restaurants.length}
      brandsCount={brands.length}
      portfolioReceivables={portfolioReceivables}
      portfolioPayables={portfolioPayables}
      portfolioLiveKds={portfolioLiveKds}
      accessLevelLabel={accessLevelLabel}
      ranges={ranges}
    />
  );
}
