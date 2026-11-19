import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getUserRestaurants } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKey, hourOfDay, resolveTimeZone, startOfDay } from "@/lib/time";
import type {
  AppRole,
  Brand,
  OrderItem,
  ProductConfig,
  Restaurant,
} from "@/lib/types";
import {
  BrandAnalyticsView,
  type BrandRange,
  type BrandRangeSnapshot,
  type BrandRestaurantStatRow,
} from "./BrandAnalyticsView";

export const dynamic = "force-dynamic";

const ALL_RANGES: readonly BrandRange[] = ["today", "yesterday", "7d", "30d"];

function rangeBounds(
  r: BrandRange,
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
  const [params, searchParams, user] = await Promise.all([
    props.params,
    props.searchParams,
    getCurrentUser(),
  ]);
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/brands/${params.slug}`)}`);
  }

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

  const rawRange = (searchParams.range ?? "7d") as BrandRange;
  const initialRange: BrandRange = (ALL_RANGES as readonly string[]).includes(
    rawRange,
  )
    ? rawRange
    : "7d";

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
  const now = new Date();
  const window60Start = startOfDay(now, timeZone, -59);
  const window30StartDate = dayKey(startOfDay(now, timeZone, -29), timeZone);
  const todayDateKey = dayKey(now, timeZone);

  const [
    { data: ordersData },
    { data: liveQueueData },
    tabsRes,
    corpInvoicesRes,
    vendorPosRes,
    employeesRes,
    expensesRes,
  ] =
    restIds.length > 0
      ? await Promise.all([
          outletIds.length > 0
            ? admin
                .from("orders")
                .select(
                  "id, outlet_id, source, status, order_type, customer_email, total_amount, cgst_amount, sgst_amount, gst_paid_by_operator, placed_at, order_items(id, order_id, quantity, total_price, product_config)",
                )
                .in("outlet_id", outletIds)
                .gte("placed_at", window60Start.toISOString())
                .neq("status", "cancelled")
                .order("placed_at", { ascending: true })
            : Promise.resolve({ data: [] }),
          outletIds.length > 0
            ? admin
                .from("orders")
                .select("id, outlet_id, status")
                .in("outlet_id", outletIds)
                .in("status", ["pending", "confirmed", "preparing", "ready"])
            : Promise.resolve({ data: [] }),
          admin
            .from("customer_tabs")
            .select("restaurant_id, current_balance, status")
            .in("restaurant_id", restIds)
            .eq("status", "active"),
          admin
            .from("corporate_invoices")
            .select("restaurant_id, total_amount, amount_paid, payment_status, status")
            .in("restaurant_id", restIds)
            .neq("status", "cancelled"),
          admin
            .from("vendor_purchase_orders")
            .select("restaurant_id, total_amount, amount_paid, status")
            .in("restaurant_id", restIds)
            .neq("status", "cancelled"),
          admin
            .from("hr_employees")
            .select("restaurant_id, status")
            .in("restaurant_id", restIds)
            .eq("status", "active"),
          admin
            .from("outlet_expenses")
            .select("expense_date, amount")
            .in("restaurant_id", restIds)
            .gte("expense_date", window30StartDate)
            .lte("expense_date", todayDateKey),
        ])
      : [
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
        ];

  const outletToRest = new Map<string, string>(
    outlets.map((o) => [o.id, o.restaurant_id]),
  );

  const liveQueueByRest = new Map<string, number>();
  let totalBrandLiveQueue = 0;
  for (const q of liveQueueData ?? []) {
    const rid = outletToRest.get(q.outlet_id);
    if (!rid) continue;
    liveQueueByRest.set(rid, (liveQueueByRest.get(rid) ?? 0) + 1);
    totalBrandLiveQueue += 1;
  }

  const workingCapital = {
    totalCorpReceivable: (corpInvoicesRes.data ?? []).reduce(
      (s, inv) =>
        s + Math.max(0, Number(inv.total_amount ?? 0) - Number(inv.amount_paid ?? 0)),
      0,
    ),
    openCorpInvoicesCount: (corpInvoicesRes.data ?? []).filter(
      (inv) => inv.payment_status !== "paid",
    ).length,
    totalTabReceivable: (tabsRes.data ?? []).reduce(
      (s, t) => s + Math.max(0, Number(t.current_balance ?? 0)),
      0,
    ),
    activeTabAccountsCount: (tabsRes.data ?? []).length,
    totalVendorPayables: (vendorPosRes.data ?? []).reduce(
      (s, po) =>
        s + Math.max(0, Number(po.total_amount ?? 0) - Number(po.amount_paid ?? 0)),
      0,
    ),
    activeStaffCount: (employeesRes.data ?? []).length,
  };

  const expenseRows = (expensesRes.data ?? []).map((ex) => ({
    expenseDate: ex.expense_date,
    amount: Number(ex.amount ?? 0),
  }));

  const normalizedOrders = (ordersData ?? []).map((raw) => {
    const rid = outletToRest.get(raw.outlet_id) ?? "";
    const isOpenPosTable =
      raw.source === "pos" &&
      (raw.customer_email ?? "").toLowerCase().startsWith("pos+open");
    const oItems = (raw.order_items ?? []) as unknown as OrderItem[];
    const amt = Number(raw.total_amount ?? 0);
    const orderGst = raw.gst_paid_by_operator
      ? 0
      : Number(raw.cgst_amount ?? 0) + Number(raw.sgst_amount ?? 0) > 0
        ? Number(raw.cgst_amount ?? 0) + Number(raw.sgst_amount ?? 0)
        : gstFromItems(oItems);
    return {
      rid,
      isOpenPosTable,
      source: raw.source,
      orderType: raw.order_type ?? "takeaway",
      amt,
      orderGst,
      placedAtIso: raw.placed_at,
      placedAtMs: new Date(raw.placed_at).getTime(),
      oItems,
    };
  });

  const buildRangeSnapshot = (rKey: BrandRange): BrandRangeSnapshot => {
    const { start, end } = rangeBounds(rKey, now, timeZone);
    const startMs = start.getTime();
    const endMs = end.getTime();
    const periodMs = endMs - startMs;
    const prevEndMs = startMs - 1;
    const prevStartMs = prevEndMs - periodMs;
    const startDateKey = dayKey(start, timeZone);
    const endDateKey = dayKey(end, timeZone);
    const isHourly = rKey === "today" || rKey === "yesterday";

    const periodExpensesTotal = expenseRows
      .filter(
        (ex) => ex.expenseDate >= startDateKey && ex.expenseDate <= endDateKey,
      )
      .reduce((s, ex) => s + ex.amount, 0);

    const statsByRest = new Map<string, BrandRestaurantStatRow>();
    for (const r of attachedList) {
      const myRole = roleByRestaurantId.get(r.id);
      statsByRest.set(r.id, {
        restaurantId: r.id,
        name: r.name,
        slug: r.slug,
        outletsCount: outlets.filter((o) => o.restaurant_id === r.id).length,
        orders: 0,
        openTables: 0,
        revenue: 0,
        gst: 0,
        liveQueue: liveQueueByRest.get(r.id) ?? 0,
        canOpenRestAdmin: myRole === "admin" || myRole === "manager",
        canOpenRestPos: Boolean(myRole),
        canDetach: isOwner || myRole === "admin",
      });
    }

    let totalBrandOrders = 0;
    let totalBrandRevenue = 0;
    let totalBrandGst = 0;
    let prevOrders = 0;
    let prevRevenue = 0;

    const allItems: OrderItem[] = [];
    const sourceTotals = new Map<string, { count: number; revenue: number }>();
    const typeTotals = new Map<string, { count: number; revenue: number }>();
    const settledOrders: Array<{ placed_at: string; total_amount: number }> = [];

    for (const o of normalizedOrders) {
      if (!o.rid) continue;
      const st = statsByRest.get(o.rid);
      if (!st) continue;

      if (o.placedAtMs >= startMs && o.placedAtMs <= endMs) {
        if (o.isOpenPosTable) {
          st.openTables += 1;
          continue;
        }
        st.orders += 1;
        st.revenue += o.amt;
        st.gst += o.orderGst;

        totalBrandOrders += 1;
        totalBrandRevenue += o.amt;
        totalBrandGst += o.orderGst;
        allItems.push(...o.oItems);
        settledOrders.push({
          placed_at: o.placedAtIso,
          total_amount: o.amt,
        });

        const srcCur = sourceTotals.get(o.source) ?? { count: 0, revenue: 0 };
        srcCur.count += 1;
        srcCur.revenue += o.amt;
        sourceTotals.set(o.source, srcCur);

        const typCur = typeTotals.get(o.orderType) ?? { count: 0, revenue: 0 };
        typCur.count += 1;
        typCur.revenue += o.amt;
        typeTotals.set(o.orderType, typCur);
      } else if (o.placedAtMs >= prevStartMs && o.placedAtMs <= prevEndMs) {
        if (o.isOpenPosTable) continue;
        prevOrders += 1;
        prevRevenue += o.amt;
      }
    }

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
      for (const o of settledOrders) {
        const key = dayKey(new Date(o.placed_at), timeZone);
        const bucket = map.get(key);
        if (bucket) bucket.value += o.total_amount;
      }
      series.push(...map.values());
    }

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

    const sources = [...sourceTotals.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([source, v]) => ({ source, count: v.count, revenue: v.revenue }));

    const types = [...typeTotals.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([orderType, v]) => ({
        orderType,
        count: v.count,
        revenue: v.revenue,
      }));

    const rankedRestaurants = [...statsByRest.values()].sort(
      (a, b) => b.revenue - a.revenue,
    );

    return {
      totalBrandOrders,
      totalBrandRevenue,
      totalBrandGst,
      prevOrders,
      prevRevenue,
      periodExpensesTotal,
      isHourly,
      series,
      topProducts,
      sources,
      types,
      rankedRestaurants,
    };
  };

  const ranges: Record<BrandRange, BrandRangeSnapshot> = {
    today: buildRangeSnapshot("today"),
    yesterday: buildRangeSnapshot("yesterday"),
    "7d": buildRangeSnapshot("7d"),
    "30d": buildRangeSnapshot("30d"),
  };

  const attachable = ownRestaurants
    .filter(({ role }) => role === "admin")
    .map(({ restaurant }) => restaurant)
    .filter((r) => r.brand_id === null);

  return (
    <BrandAnalyticsView
      brand={brand}
      isOwner={isOwner}
      initialRange={initialRange}
      restaurantsCount={attachedList.length}
      outletsCount={outlets.length}
      totalBrandLiveQueue={totalBrandLiveQueue}
      workingCapital={workingCapital}
      attachable={attachable}
      ranges={ranges}
    />
  );
}
