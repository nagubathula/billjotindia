import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRoles, getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant, getSelectedOutlet } from "@/lib/outlet-context";
import { getPublicPaymentConfig } from "@/lib/payments";
import { PosBilling } from "./PosBilling";
import type { AppRole, Category, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  user: "Cashier",
};

type Props = { params: Promise<{ slug: string }> };

export default async function PosPage(props: Props) {
  const params = await props.params;
  const [restaurant] = await Promise.all([
    getRestaurantBySlug(params.slug),
    getCurrentUserRoles(),
  ]);
  if (!restaurant) notFound();

  // Outlet reads are RLS-scoped, so it's safe to start them alongside the
  // role check rather than after it.
  const [{ user, role }, outlet, outlets] = await Promise.all([
    requireRole(["admin", "manager", "user"], {
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
            {restaurant.name} doesn't have any outlets yet. An admin needs to
            create one in Settings (coming soon) before the POS can be used.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: products }, { data: categories }, paymentConfig] = await Promise.all([
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
  ]);

  return (
    <PosBilling
      outlet={outlet}
      outlets={outlets}
      categories={(categories ?? []) as Category[]}
      products={(products ?? []) as Product[]}
      paymentConfig={paymentConfig}
      restaurantSlug={params.slug}
      restaurantName={restaurant.name}
      staffEmail={user.email ?? "unknown"}
      staffRoleLabel={ROLE_LABEL[role]}
    />
  );
}
