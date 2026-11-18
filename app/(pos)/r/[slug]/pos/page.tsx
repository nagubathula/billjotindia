import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRoles, getRestaurantBySlug, requireRole } from "@/lib/auth";
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
import type { Category, Coupon, CustomerTab, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function PosPage(props: Props) {
  const params = await props.params;
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
  const [
    { data: products },
    { data: categories },
    paymentConfig,
    customerTabsRes,
    couponsRes,
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
  ]);

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
      products={(products ?? []) as Product[]}
      paymentConfig={paymentConfig}
      customerTabs={(customerTabsRes.data ?? []) as CustomerTab[]}
      posCoupons={posCoupons}
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
