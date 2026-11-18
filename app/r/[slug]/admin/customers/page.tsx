import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { CUSTOMER_LIST_SOURCES } from "@/lib/channels";
import { DEFAULT_TIME_ZONE } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import type { Coupon, Order } from "@/lib/types";
import { CrmWorkbench, type CustomerRow } from "./CrmWorkbench";

export const dynamic = "force-dynamic";

export default async function CustomersPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/customers`,
  });

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);
  const scoped =
    outletIds.length > 0
      ? outletIds
      : ["00000000-0000-0000-0000-000000000000"];

  const admin = createAdminClient();
  const [ordersRes, couponsRes] = await Promise.all([
    admin
      .from("orders")
      .select(
        "customer_name, customer_email, customer_phone, total_amount, placed_at, source, status",
      )
      .in("outlet_id", scoped)
      .in("source", CUSTOMER_LIST_SOURCES)
      .neq("status", "cancelled")
      .order("placed_at", { ascending: false })
      .limit(5000),
    admin
      .from("coupons")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const orders = (ordersRes.data ?? []) as Pick<
    Order,
    | "customer_name"
    | "customer_email"
    | "customer_phone"
    | "total_amount"
    | "placed_at"
    | "source"
    | "status"
  >[];
  const coupons = (couponsRes.data ?? []) as Coupon[];

  const nowMs = Date.now();
  const map = new Map<
    string,
    {
      email: string;
      name: string;
      phone: string | null;
      orders: number;
      spent: number;
      last: number;
      first: number;
    }
  >();

  for (const o of orders) {
    const email = (o.customer_email ?? "").toLowerCase().trim();
    if (!email || email.startsWith("pos+") || email.startsWith("guest+"))
      continue;

    const t = o.placed_at ? new Date(o.placed_at).getTime() : 0;
    const cur = map.get(email) ?? {
      email,
      name: o.customer_name ?? email,
      phone: o.customer_phone ?? null,
      orders: 0,
      spent: 0,
      last: 0,
      first: Number.MAX_SAFE_INTEGER,
    };

    cur.orders += 1;
    cur.spent += Number(o.total_amount);
    if (!cur.phone && o.customer_phone) cur.phone = o.customer_phone;
    cur.last = Math.max(cur.last, t);
    cur.first = Math.min(cur.first, t);
    map.set(email, cur);
  }

  const fmtDate = (t: number) =>
    t
      ? new Date(t).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          timeZone: DEFAULT_TIME_ZONE,
        })
      : "—";

  const customers: CustomerRow[] = Array.from(map.values())
    .sort((a, b) => b.spent - a.spent)
    .map((c) => ({
      ...c,
      lastDateLabel: fmtDate(c.last),
      daysSinceLast: c.last
        ? Math.max(0, Math.floor((nowMs - c.last) / (1000 * 60 * 60 * 24)))
        : 0,
      points: Math.floor(c.spent / 20),
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM, Loyalty & Coupons"
        description="First-party customer segments, loyalty reward balances, WhatsApp re-engagement, and database-backed promotional coupons."
      />

      <CrmWorkbench
        restaurantSlug={params.slug}
        restaurantName={restaurant.name}
        customers={customers}
        initialCoupons={coupons}
      />
    </div>
  );
}
