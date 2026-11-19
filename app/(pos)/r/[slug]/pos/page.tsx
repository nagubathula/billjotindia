import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRoles, getRestaurantBySlug, requireRole } from "@/lib/auth";
import {
  buildModifiersByProductMap,
  type ModifierGroupData,
  type ModifierOptionData,
} from "@/lib/customizations";
import { getOutletsForRestaurant, getSelectedOutlet } from "@/lib/outlet-context";
import { getPublicPaymentConfig } from "@/lib/payments";
import { PosBilling } from "./PosBilling";
import {
  POS_ROLES,
  ROLE_LABEL,
  canOpenAdmin,
  canTakeNonTableOrders,
  canTakePayment,
  canVoidSentItems,
} from "@/lib/roles";
import type {
  Category,
  Coupon,
  CustomerTab,
  Product,
  ProductCustomization,
  TableBooking,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ table?: string }>;
};

export default async function PosPage(props: Props) {
  const [params, query] = await Promise.all([props.params, props.searchParams]);
  const [restaurant] = await Promise.all([
    getRestaurantBySlug(params.slug),
    getCurrentUserRoles(),
  ]);
  if (!restaurant) notFound();

  const [{ user, role }, outlet, outlets] = await Promise.all([
    requireRole(POS_ROLES, {
      restaurantSlug: params.slug,
      redirectTo: `/r/${params.slug}/pos`,
    }),
    getSelectedOutlet(restaurant.id, params.slug),
    getOutletsForRestaurant(restaurant.id),
  ]);

  if (!outlet) {
    return (
      <div className="flex h-screen items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-2">
          <h1 className="text-xl font-semibold">No outlet configured</h1>
          <p className="text-sm text-muted-foreground">
            {restaurant.name} doesn&apos;t have any outlets yet. An admin needs to
            create one in Settings (coming soon) before the POS can be used.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const nowMs = Date.now();
  const bookingWindowStart = new Date(nowMs - 6 * 60 * 60_000).toISOString();
  const bookingWindowEnd = new Date(nowMs + 24 * 60 * 60_000).toISOString();

  const [
    { data: products },
    { data: categories },
    { data: groups },
    paymentConfig,
    customerTabsRes,
    couponsRes,
    bookingsRes,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("status", "active")
      .eq("outlet_id", outlet.id)
      .order("category")
      .order("name"),
    supabase
      .from("categories")
      .select("*")
      .eq("status", "active")
      .eq("outlet_id", outlet.id)
      .order("sort_order"),
    supabase
      .from("customization_groups")
      .select("*")
      .eq("status", "active")
      .eq("outlet_id", outlet.id)
      .order("sort_order"),
    getPublicPaymentConfig(outlet.id),
    admin
      .from("customer_tabs")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("status", "active")
      .order("customer_name", { ascending: true }),
    admin
      .from("coupons")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .in("channel", ["all", "pos", "dine_in"])
      .order("min_order_amount", { ascending: true }),
    admin
      .from("table_bookings")
      .select("*")
      .eq("outlet_id", outlet.id)
      .in("status", ["pending_payment", "pending", "confirmed", "waitlisted", "notified", "seated"])
      .gte("reserved_for", bookingWindowStart)
      .lte("reserved_for", bookingWindowEnd)
      .order("reserved_for", { ascending: true }),
  ]);

  const productList = (products ?? []) as Product[];
  const groupRows = (groups ?? []) as ModifierGroupData[];
  const prodIds = productList.map((p) => p.id);
  const groupIds = groupRows.map((g) => g.id);

  const [{ data: links }, { data: options }] = await Promise.all([
    prodIds.length > 0
      ? supabase
          .from("product_customizations")
          .select("*")
          .in("product_id", prodIds)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
    groupIds.length > 0
      ? supabase
          .from("customization_options")
          .select("*")
          .in("group_id", groupIds)
          .eq("status", "active")
          .order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);

  const modifiersByProduct = buildModifiersByProductMap({
    links: (links ?? []) as ProductCustomization[],
    groups: groupRows,
    options: (options ?? []) as ModifierOptionData[],
  });

  const posCoupons = ((couponsRes.data ?? []) as Coupon[]).filter((c) => {
    if (c.expires_at && new Date(c.expires_at).getTime() <= nowMs) return false;
    if (c.usage_limit && c.used_count >= c.usage_limit) return false;
    return true;
  });

  return (
    <PosBilling
      outlet={outlet}
      outlets={outlets}
      categories={(categories ?? []) as Category[]}
      products={productList}
      modifiersByProduct={modifiersByProduct}
      paymentConfig={paymentConfig}
      customerTabs={(customerTabsRes.data ?? []) as CustomerTab[]}
      posCoupons={posCoupons}
      initialBookings={(bookingsRes.data ?? []) as TableBooking[]}
      requestedTable={query.table ?? null}
      restaurantSlug={params.slug}
      restaurantName={restaurant.name}
      staffEmail={user.email ?? "unknown"}
      staffRoleLabel={ROLE_LABEL[role]}
      canTakePayment={canTakePayment(role)}
      canTakeNonTableOrders={canTakeNonTableOrders(role)}
      canVoidSentItems={canVoidSentItems(role)}
      canOpenAdmin={canOpenAdmin(role)}
    />
  );
}
